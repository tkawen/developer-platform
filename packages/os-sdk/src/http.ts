import { createApiError, retryAfterOf } from './errors.js';
import type { ClientOptions, FetchLike, IdempotentRequestOptions, RateLimitInfo, RequestOptions, ResponseMeta } from './types.js';

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

/** `Idempotency-Key` syntax from the spec: 1-255 visible ASCII characters. */
const IDEMPOTENCY_KEY = /^[!-~]{1,255}$/;

const META = new WeakMap<object, ResponseMeta>();

/**
 * Transport metadata of a successful answer returned by any method: HTTP status, whether it was an
 * idempotent replay (`Idempotent-Replayed: true`), the `Idempotency-Key` sent, and the `X-RateLimit-*` headers.
 * Returns `undefined` for values the SDK did not produce (and for empty 204 answers).
 *
 * ```ts
 * const order = await tk.createCheckoutOrder({}, { idempotencyKey: key });
 * if (getResponseMeta(order)?.replayed) console.log('same order as the first attempt');
 * ```
 */
export function getResponseMeta(result: unknown): ResponseMeta | undefined {
  return typeof result === 'object' && result !== null ? META.get(result) : undefined;
}

function intHeader(h: Headers, name: string): number | null {
  const v = h.get(name);
  if (v == null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function rateLimitOf(h: Headers): RateLimitInfo | null {
  const info = {
    limit: intHeader(h, 'x-ratelimit-limit'),
    remaining: intHeader(h, 'x-ratelimit-remaining'),
    reset: intHeader(h, 'x-ratelimit-reset'),
  };
  return info.limit === null && info.remaining === null && info.reset === null ? null : info;
}

function randomUuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof c?.randomUUID !== 'function') {
    throw new TypeError("idempotency: 'auto' needs crypto.randomUUID (Node >= 19 or a browser); pass a key generator function instead");
  }
  return c.randomUUID();
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
  /** The operation accepts `Idempotency-Key` (reads `options.idempotencyKey` and the client's `idempotency`). */
  idempotent?: boolean;
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
  #token: string | undefined;
  readonly #fetch: FetchLike;
  readonly #locale: string | undefined;
  readonly #retry429: boolean;
  readonly #maxWait: number;
  readonly #headers: Record<string, string>;
  readonly #idempotency: 'off' | 'auto' | (() => string);

  constructor(opts: ClientOptions) {
    if (!opts || typeof opts !== 'object') throw new TypeError('createClient(options) requires an options object');
    this.baseUrl = resolveBaseUrl(opts.academy, opts.baseUrl);
    this.setToken(opts.token);
    const f = opts.fetch ?? (typeof fetch === 'function' ? (fetch as FetchLike) : undefined);
    if (!f) throw new TypeError('No fetch available: pass options.fetch (Node >= 18 has a global fetch)');
    // Call through a wrapper so a bare global fetch is never invoked with the wrong `this`.
    this.#fetch = (input, init) => f(input, init);
    this.#locale = opts.locale && opts.locale.trim() !== '' ? opts.locale.trim() : undefined;
    this.#retry429 = opts.retry?.on429 === true;
    this.#maxWait = opts.retry?.maxWaitSeconds ?? 60;
    const idem = opts.idempotency ?? 'off';
    if (idem !== 'off' && idem !== 'auto' && typeof idem !== 'function') {
      throw new TypeError("idempotency must be 'off', 'auto' or a function returning a key");
    }
    this.#idempotency = idem;
    this.#headers = {};
    for (const [k, v] of Object.entries(opts.headers ?? {})) {
      if (k.toLowerCase() !== 'authorization') this.#headers[k] = v;
    }
  }

  /** True when a bearer token was configured. The token itself is never exposed. */
  get authenticated(): boolean {
    return this.#token !== undefined;
  }

  /** Replace (or clear, with `undefined`/empty) the bearer token used by later calls. */
  setToken(token: string | undefined | null): void {
    this.#token = typeof token === 'string' && token.trim() !== '' ? token.trim() : undefined;
  }

  #idempotencyKey(options: IdempotentRequestOptions | undefined): string | undefined {
    let key = options?.idempotencyKey;
    if (key === undefined) {
      if (this.#idempotency === 'off') return undefined;
      key = this.#idempotency === 'auto' ? randomUuid() : this.#idempotency();
    }
    if (typeof key !== 'string' || !IDEMPOTENCY_KEY.test(key)) {
      throw new TypeError('Idempotency-Key must be 1-255 visible ASCII characters (no spaces)');
    }
    return key;
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
    if (spec.idempotent) {
      const opts = spec.options as IdempotentRequestOptions | undefined;
      const manual = Object.keys(headers).filter((k) => k.toLowerCase() === 'idempotency-key');
      // An explicit `idempotencyKey` wins over a raw header; a raw header wins over the automatic key.
      if (opts?.idempotencyKey !== undefined || manual.length === 0) {
        const key = this.#idempotencyKey(opts);
        if (key !== undefined) {
          for (const k of manual) delete headers[k];
          headers['Idempotency-Key'] = key;
        }
      }
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
    if (ok) {
      if (typeof parsed === 'object' && parsed !== null) {
        const sentKey = Object.entries(headers).find(([k]) => k.toLowerCase() === 'idempotency-key')?.[1] ?? null;
        META.set(parsed, {
          status: res.status,
          replayed: (res.headers.get('idempotent-replayed') ?? '').trim().toLowerCase() === 'true',
          idempotencyKey: sentKey,
          rateLimit: rateLimitOf(res.headers),
          headers: res.headers,
        });
      }
      return parsed as T;
    }
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
