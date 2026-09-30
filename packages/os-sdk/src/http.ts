import { createApiError, retryAfterOf } from './errors.js';
import type { ClientOptions, FetchLike, RequestOptions } from './types.js';

export const ROOT_DOMAIN = 'tkawen.com';
const ACADEMY_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

export function resolveBaseUrl(academy: string, baseUrl?: string): string {
  if (baseUrl !== undefined) {
    let u: URL;
    try {
      u = new URL(baseUrl);
    } catch {
      throw new TypeError('baseUrl must be an absolute URL');
    }
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) {
      throw new TypeError('baseUrl must use https (http is allowed for localhost only)');
    }
    if (u.username || u.password) throw new TypeError('baseUrl must not contain credentials');
    return (u.origin + u.pathname).replace(/\/+$/, '');
  }
  if (typeof academy !== 'string' || !ACADEMY_SLUG.test(academy)) {
    throw new TypeError('academy must be a subdomain label such as "demo" (letters, digits, hyphens)');
  }
  return `https://${academy.toLowerCase()}.${ROOT_DOMAIN}/api/v1`;
}

type QueryValue = string | number | boolean | null | undefined;

export interface CallSpec {
  operationId: string;
  method: 'GET' | 'POST' | 'DELETE';
  /** Path template from the spec, e.g. `/courses/{slug}`. */
  path: string;
  pathParams?: Record<string, string | number>;
  query?: object | undefined;
  /** JSON body, or a FormData (multipart). */
  body?: unknown;
  headers?: Record<string, string | undefined>;
  /** Statuses (besides 2xx) whose body is returned instead of thrown. */
  acceptStatuses?: number[];
  /** Return the raw Response instead of parsing JSON. */
  raw?: boolean;
  options?: RequestOptions | undefined;
}

export function buildUrl(
  base: string,
  path: string,
  pathParams?: Record<string, string | number>,
  query?: object,
): string {
  const filled = path.replace(/\{([^}]+)\}/g, (_m, name: string) => {
    const v = pathParams?.[name];
    if (v === undefined || v === null || String(v) === '') throw new TypeError(`Missing path parameter "${name}"`);
    return encodeURIComponent(String(v));
  });
  let url = base + filled;
  if (query) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(query as Record<string, QueryValue>)) {
      if (v === undefined || v === null) continue;
      sp.append(k, String(v));
    }
    const qs = sp.toString();
    if (qs) url += `?${qs}`;
  }
  return url;
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (text === '') return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

export class HttpCore {
  readonly baseUrl: string;
  readonly #token: string | undefined;
  readonly #fetch: FetchLike;
  readonly #locale: string | undefined;
  readonly #retry429: boolean;
  readonly #maxWait: number;
  readonly #headers: Record<string, string>;

  constructor(opts: ClientOptions) {
    if (!opts || typeof opts !== 'object') throw new TypeError('createClient(options) requires an options object');
    this.baseUrl = resolveBaseUrl(opts.academy, opts.baseUrl);
    this.#token = typeof opts.token === 'string' && opts.token.trim() !== '' ? opts.token.trim() : undefined;
    const f = opts.fetch ?? (typeof fetch === 'function' ? (fetch as FetchLike) : undefined);
    if (!f) throw new TypeError('No fetch available: pass options.fetch (Node >= 18 has a global fetch)');
    // Call through a wrapper so a bare global fetch is never invoked with the wrong `this`.
    this.#fetch = (input, init) => f(input, init);
    this.#locale = opts.locale && opts.locale.trim() !== '' ? opts.locale.trim() : undefined;
    this.#retry429 = opts.retry?.on429 === true;
    this.#maxWait = opts.retry?.maxWaitSeconds ?? 60;
    this.#headers = {};
    for (const [k, v] of Object.entries(opts.headers ?? {})) {
      if (k.toLowerCase() !== 'authorization') this.#headers[k] = v;
    }
  }

  /** True when a bearer token was configured. The token itself is never exposed. */
  get authenticated(): boolean {
    return this.#token !== undefined;
  }

  async call<T>(spec: CallSpec): Promise<T> {
    const url = buildUrl(this.baseUrl, spec.path, spec.pathParams, spec.query);
    const headers: Record<string, string> = { Accept: 'application/json', ...this.#headers };
    if (this.#locale) headers['Accept-Language'] = this.#locale;
    for (const [k, v] of Object.entries(spec.headers ?? {})) {
      if (v !== undefined && v !== '') headers[k] = v;
    }
    for (const [k, v] of Object.entries(spec.options?.headers ?? {})) {
      if (k.toLowerCase() !== 'authorization') headers[k] = v;
    }
    if (this.#token) headers['Authorization'] = `Bearer ${this.#token}`;

    let body: BodyInit | undefined;
    if (spec.body !== undefined) {
      if (typeof FormData !== 'undefined' && spec.body instanceof FormData) {
        body = spec.body; // fetch sets the multipart boundary itself
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(spec.body);
      }
    }
    const init: RequestInit = { method: spec.method, headers };
    if (body !== undefined) init.body = body;
    if (spec.options?.signal) init.signal = spec.options.signal;

    let res = await this.#fetch(url, init);
    if (res.status === 429 && this.#retry429) {
      // A 429 is answered by the throttle before the handler runs, so one retry is safe even for POSTs.
      const peek = await readBody(res.clone());
      const wait = retryAfterOf(peek, res.headers) ?? 1;
      if (wait <= this.#maxWait) {
        await sleep(wait * 1000, spec.options?.signal);
        res = await this.#fetch(url, init);
      }
    }

    const ok = (res.status >= 200 && res.status < 300) || (spec.acceptStatuses?.includes(res.status) ?? false);
    if (ok && spec.raw) return res as unknown as T;
    const parsed = await readBody(res);
    if (ok) return parsed as T;
    throw createApiError({
      status: res.status,
      body: parsed,
      method: spec.method,
      url,
      operationId: spec.operationId,
      headers: res.headers,
    });
  }
}
