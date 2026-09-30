import type {
  FetchLike,
  Provider,
  VerifyErrorCode,
  VerifyIssuer,
  VerifyOptions,
  VerifyResult,
  VerifyStatus,
} from './types.js';

export const CERTIFY_ORIGIN = 'https://algeriacertify.com';
export const ACADEMY_ROOT_DOMAIN = 'tkawen.com';
export const DEFAULT_TIMEOUT_MS = 10_000;

const ACADEMY_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
/** Academy: printed certificate_code or credential_uid. */
const ACADEMY_CODE = /^[A-Za-z0-9._:-]{1,128}$/;
/** Algeria Certify route constraint: `[A-Za-z0-9_-]+`. */
const CERTIFY_CODE = /^[A-Za-z0-9_-]{1,128}$/;

/** Academy status strings that mean "exists, but the signature check failed". */
const ACADEMY_INVALID = new Set(['unsigned', 'tampered', 'unknown_key', 'invalid_signature']);

// ── small, defensive readers: the body is untrusted input ────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  if (typeof v === 'string') {
    const t = v.trim();
    return t === '' ? undefined : t;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return undefined;
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Only http(s) URLs pass; anything else (javascript:, data:) is dropped. */
function safeUrl(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

function isPast(date: string | undefined, now: Date): boolean {
  if (!date) return false;
  // Raw DB datetimes ("2026-01-01 10:00:00") parse once the space becomes a T.
  const t = Date.parse(date.includes('T') ? date : date.replace(' ', 'T'));
  return Number.isFinite(t) && t < now.getTime();
}

// ── URL building ─────────────────────────────────────────────────────────────

function normaliseBase(baseUrl: string): string {
  let u: URL;
  try {
    u = new URL(baseUrl);
  } catch {
    throw new TypeError('baseUrl must be an absolute URL');
  }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) {
    throw new TypeError('baseUrl must use https (http is allowed for localhost only)');
  }
  return (u.origin + u.pathname).replace(/\/+$/, '');
}

export interface ResolvedUrls {
  apiUrl: string;
  verifyUrl: string;
  origin: string;
}

/** Build the API URL and the human verify-page URL. Throws TypeError on bad input. */
export function resolveUrls(opts: Pick<VerifyOptions, 'code' | 'provider' | 'academy' | 'baseUrl' | 'certifyEndpoint'>): ResolvedUrls {
  const code = String(opts.code ?? '').trim();
  const enc = encodeURIComponent(code);

  if (opts.provider === 'academy') {
    if (!ACADEMY_CODE.test(code)) throw new TypeError('invalid certificate code');
    let origin: string;
    if (opts.baseUrl) {
      origin = normaliseBase(opts.baseUrl);
    } else {
      const slug = String(opts.academy ?? '').trim().toLowerCase();
      if (!ACADEMY_SLUG.test(slug)) throw new TypeError('academy must be a subdomain slug such as "code"');
      origin = `https://${slug}.${ACADEMY_ROOT_DOMAIN}`;
    }
    return {
      origin,
      apiUrl: `${origin}/api/v1/verify/${enc}`,
      verifyUrl: `${origin}/certificates/verify/${enc}`,
    };
  }

  if (opts.provider === 'certify') {
    if (!CERTIFY_CODE.test(code)) throw new TypeError('invalid certificate code');
    const origin = opts.baseUrl ? normaliseBase(opts.baseUrl) : CERTIFY_ORIGIN;
    const apiUrl =
      opts.certifyEndpoint === 'verify'
        ? `${origin}/api/v1/public/verify/${enc}`
        : `${origin}/api/public/v1/certificate/${enc}`;
    return { origin, apiUrl, verifyUrl: `${origin}/verify/${enc}` };
  }

  throw new TypeError('provider must be "academy" or "certify"');
}

// ── normalisers ──────────────────────────────────────────────────────────────

export interface NormaliseContext {
  code: string;
  verifyUrl: string;
  academy?: string;
  now?: Date;
}

function base(provider: Provider, ctx: NormaliseContext, httpStatus: number, raw: unknown): VerifyResult {
  const issuer: VerifyIssuer = { provider };
  if (provider === 'academy' && ctx.academy) issuer.slug = ctx.academy;
  return { valid: false, status: 'error', code: ctx.code, issuer, verifyUrl: ctx.verifyUrl, httpStatus, raw };
}

function rateLimited(r: VerifyResult, body: unknown): VerifyResult {
  r.status = 'rate-limited';
  if (isObject(body)) r.retryAfter = num(body.retry_after);
  return r;
}

function fail(r: VerifyResult, error: VerifyErrorCode, message: string): VerifyResult {
  r.status = 'error';
  r.error = error;
  r.errorMessage = message;
  return r;
}

/**
 * TKAWEN OS academy: GET /api/v1/verify/{code}
 * 200 {status, credential_uid, issued_at, student_name, course_title}
 * 404 {status:"not_found"} · 429 {message, retry_after}
 */
export function normaliseAcademy(body: unknown, httpStatus: number, ctx: NormaliseContext): VerifyResult {
  const r = base('academy', ctx, httpStatus, body);
  if (httpStatus === 429) return rateLimited(r, body);
  if (httpStatus === 404) {
    r.status = 'not-found';
    r.reason = isObject(body) ? str(body.status) ?? 'not_found' : 'not_found';
    return r;
  }
  if (httpStatus < 200 || httpStatus >= 300) return fail(r, 'http_error', `HTTP ${httpStatus}`);
  if (!isObject(body) || typeof body.status !== 'string') return fail(r, 'bad_response', 'unexpected response shape');

  const s = body.status;
  r.reason = s;
  r.holderName = str(body.student_name);
  r.courseName = str(body.course_title);
  r.issuedAt = str(body.issued_at);
  r.credentialId = str(body.credential_uid);

  let status: VerifyStatus;
  if (s === 'valid') status = 'valid';
  else if (s === 'revoked') status = 'revoked';
  else if (ACADEMY_INVALID.has(s)) status = 'invalid';
  else if (s === 'not_found') status = 'not-found';
  else return fail(r, 'bad_response', `unknown status "${s}"`);

  r.status = status;
  r.valid = status === 'valid';
  return r;
}

/**
 * Algeria Certify. Accepts both public shapes:
 *  - /api/public/v1/certificate/{token}: {status: active|revoked|expired, is_valid, fullname, course, issuer{…}, …}
 *  - /api/v1/public/verify/{token}:      {success, data:{certificate{…}, recipient{…}, issuer{…}, integrity{…}}}
 * 404 {error:"not_found"} | {success:false,error:"not_found"} · 429 {message[, retry_after]}
 */
export function normaliseCertify(body: unknown, httpStatus: number, ctx: NormaliseContext): VerifyResult {
  const r = base('certify', ctx, httpStatus, body);
  const now = ctx.now ?? new Date();
  if (httpStatus === 429) return rateLimited(r, body);
  if (httpStatus === 404) {
    r.status = 'not-found';
    r.reason = 'not_found';
    return r;
  }
  if (httpStatus < 200 || httpStatus >= 300) return fail(r, 'http_error', `HTTP ${httpStatus}`);
  if (!isObject(body)) return fail(r, 'bad_response', 'unexpected response shape');

  // Full API shape
  if ('data' in body || 'success' in body) {
    const data = isObject(body.data) ? body.data : undefined;
    const cert = data && isObject(data.certificate) ? data.certificate : undefined;
    if (body.success !== true || !cert) {
      if (body.error === 'not_found') {
        r.status = 'not-found';
        r.reason = 'not_found';
        return r;
      }
      return fail(r, 'bad_response', 'unexpected response shape');
    }
    const recipient = data && isObject(data.recipient) ? data.recipient : {};
    const iss = data && isObject(data.issuer) ? data.issuer : {};
    r.reason = str(cert.status);
    r.holderName = str(recipient.fullname);
    r.courseName = str(cert.course);
    r.issuedAt = str(cert.issued_at);
    r.expiresAt = str(cert.expires_at);
    r.credentialId = str(cert.token);
    r.issuer = { provider: 'certify', name: str(iss.name), slug: str(iss.slug) };
    r.verifyUrl = safeUrl(cert.verify_url) ?? r.verifyUrl;
    const revoked = cert.is_revoked === true || (r.reason !== undefined && r.reason !== 'active');
    r.status = revoked ? 'revoked' : isPast(r.expiresAt, now) ? 'expired' : 'valid';
    r.valid = r.status === 'valid';
    return r;
  }

  // Embed shape
  const s = str(body.status);
  if (!s) return fail(r, 'bad_response', 'unexpected response shape');
  r.reason = s;
  r.holderName = str(body.fullname);
  r.courseName = str(body.course);
  r.issuedAt = str(body.issued_at);
  r.expiresAt = str(body.expires_at);
  r.credentialId = str(body.token);
  const iss = isObject(body.issuer) ? body.issuer : {};
  r.issuer = { provider: 'certify', name: str(iss.name), slug: str(iss.slug), profileUrl: safeUrl(iss.profile_url) };
  r.verifyUrl = safeUrl(body.verify_url) ?? r.verifyUrl;

  if (s === 'revoked') r.status = 'revoked';
  else if (s === 'expired') r.status = 'expired';
  else if (s === 'active') r.status = body.is_valid === false ? 'invalid' : isPast(r.expiresAt, now) ? 'expired' : 'valid';
  else return fail(r, 'bad_response', `unknown status "${s}"`);
  r.valid = r.status === 'valid';
  return r;
}

// ── public entry point ───────────────────────────────────────────────────────

/**
 * Verify one certificate against the issuer's public endpoint. Never throws:
 * every failure (bad input, network, CORS, timeout, odd JSON) comes back as
 * `{ status: 'error', error, errorMessage }`.
 */
export async function verifyCertificate(opts: VerifyOptions): Promise<VerifyResult> {
  const code = String(opts?.code ?? '').trim();
  const provider = opts?.provider;
  const academy = opts?.academy ? String(opts.academy).trim().toLowerCase() : undefined;

  let urls: ResolvedUrls;
  try {
    urls = resolveUrls({ ...opts, code });
  } catch (e) {
    return {
      valid: false,
      status: 'error',
      code,
      issuer: { provider: provider === 'certify' ? 'certify' : 'academy', slug: academy },
      verifyUrl: '',
      error: 'invalid_input',
      errorMessage: (e as Error).message,
      raw: undefined,
    };
  }

  const ctx: NormaliseContext = { code, verifyUrl: urls.verifyUrl, academy };
  const normalise = provider === 'certify' ? normaliseCertify : normaliseAcademy;
  const doFetch: FetchLike | undefined = opts.fetch ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined);
  const errResult = (error: VerifyErrorCode, message: string, httpStatus?: number): VerifyResult => {
    const r = base(provider, ctx, httpStatus ?? 0, undefined);
    if (httpStatus === undefined) delete r.httpStatus;
    return fail(r, error, message);
  };
  if (!doFetch) return errResult('network', 'no fetch implementation available');

  const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timedOut = false;
  const timer = controller
    ? setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs)
    : undefined;
  const onAbort = () => controller?.abort();
  opts.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    let res: Response;
    try {
      res = await doFetch(urls.apiUrl, {
        method: 'GET',
        // Accept is CORS-safelisted: no preflight. No credentials: this is a public read.
        headers: { Accept: 'application/json' },
        credentials: 'omit',
        mode: 'cors',
        redirect: 'follow',
        signal: controller?.signal,
      });
    } catch (e) {
      if (timedOut) return errResult('timeout', `no response within ${timeoutMs} ms`);
      // A CORS rejection surfaces here as a TypeError, indistinguishable from a network failure.
      return errResult('network', (e as Error)?.message || 'network error (offline or blocked by CORS)');
    }

    let body: unknown;
    const text = await res.text().catch(() => '');
    if (text !== '') {
      try {
        body = JSON.parse(text);
      } catch {
        if (res.status === 429) return rateLimited(base(provider, ctx, 429, undefined), undefined);
        return errResult('bad_response', 'response is not JSON', res.status);
      }
    }
    const result = normalise(body, res.status, ctx);
    if (result.status === 'rate-limited' && result.retryAfter === undefined) {
      const h = num(res.headers?.get?.('Retry-After'));
      if (h !== undefined) result.retryAfter = h;
    }
    return result;
  } finally {
    if (timer) clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}
