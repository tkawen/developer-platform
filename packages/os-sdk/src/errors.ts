/**
 * Typed errors for every non-2xx answer of the TKAWEN OS API.
 *
 * The API has several error envelopes (see the spec description):
 * `{message}`, `{message, errors}` (422), `{error}`, `{message, error: "lesson_locked", needs, needs_slug}` (423),
 * `{message, retry_after}` (429) and `{status: "not_found"}` (verification). The classes below read all of them.
 */

export type TkawenErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'lesson_locked'
  | 'rate_limited'
  | 'http';

export interface TkawenApiErrorInit {
  status: number;
  body: unknown;
  method: string;
  /** Request URL. Never contains the bearer token (the token only travels in a header). */
  url: string;
  operationId: string;
  headers?: Headers;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function messageOf(status: number, body: unknown): string {
  if (isObject(body)) {
    for (const key of ['message', 'error', 'status'] as const) {
      const v = body[key];
      if (typeof v === 'string' && v.trim() !== '') return v;
    }
  }
  if (typeof body === 'string' && body.trim() !== '' && body.length <= 300) return body.trim();
  return `HTTP ${status}`;
}

/** Base class: any non-2xx response. `body` is the parsed JSON (or text) exactly as the server sent it. */
export class TkawenApiError extends Error {
  readonly kind: TkawenErrorKind = 'http';
  readonly status: number;
  readonly body: unknown;
  readonly method: string;
  readonly url: string;
  readonly operationId: string;
  readonly headers: Headers | undefined;

  constructor(init: TkawenApiErrorInit) {
    super(messageOf(init.status, init.body));
    this.name = 'TkawenApiError';
    this.status = init.status;
    this.body = init.body;
    this.method = init.method;
    this.url = init.url;
    this.operationId = init.operationId;
    this.headers = init.headers;
  }
}

/** 401: missing, invalid or revoked bearer token. */
export class TkawenUnauthorizedError extends TkawenApiError {
  override readonly kind = 'unauthorized' as const;
  constructor(init: TkawenApiErrorInit) {
    super(init);
    this.name = 'TkawenUnauthorizedError';
  }
}

/** 403: authenticated, but a policy or role check refused the request. */
export class TkawenForbiddenError extends TkawenApiError {
  override readonly kind = 'forbidden' as const;
  constructor(init: TkawenApiErrorInit) {
    super(init);
    this.name = 'TkawenForbiddenError';
  }
}

/** 404: not found, or deliberately hidden (for example a lesson you are not enrolled in). */
export class TkawenNotFoundError extends TkawenApiError {
  override readonly kind = 'not_found' as const;
  constructor(init: TkawenApiErrorInit) {
    super(init);
    this.name = 'TkawenNotFoundError';
  }
}

/**
 * 422: Laravel validation failure (`errors` maps field → messages), or a controller-level
 * `{error}` / `{message}` refusal (then `errors` is empty).
 */
export class TkawenValidationError extends TkawenApiError {
  override readonly kind = 'validation' as const;
  readonly errors: Record<string, string[]>;
  constructor(init: TkawenApiErrorInit) {
    super(init);
    this.name = 'TkawenValidationError';
    const out: Record<string, string[]> = {};
    const raw = isObject(init.body) ? init.body['errors'] : undefined;
    if (isObject(raw)) {
      for (const [field, msgs] of Object.entries(raw)) {
        if (Array.isArray(msgs)) out[field] = msgs.filter((m): m is string => typeof m === 'string');
        else if (typeof msgs === 'string') out[field] = [msgs];
      }
    }
    this.errors = out;
  }
}

/** 423 `lesson_locked`: the sequential/drip/access gate refused the lesson. */
export class TkawenLessonLockedError extends TkawenApiError {
  override readonly kind = 'lesson_locked' as const;
  /** Title of the lesson that must be completed or passed first (may be null). */
  readonly needs: string | null;
  /** Slug of that lesson (may be null). */
  readonly needsSlug: string | null;
  constructor(init: TkawenApiErrorInit) {
    super(init);
    this.name = 'TkawenLessonLockedError';
    const b = isObject(init.body) ? init.body : {};
    this.needs = typeof b['needs'] === 'string' ? b['needs'] : null;
    this.needsSlug = typeof b['needs_slug'] === 'string' ? b['needs_slug'] : null;
  }
}

/** 429: rate limited. `retryAfter` is in seconds, read from the body `retry_after`, else the `Retry-After` header. */
export class TkawenRateLimitError extends TkawenApiError {
  override readonly kind = 'rate_limited' as const;
  readonly retryAfter: number | null;
  constructor(init: TkawenApiErrorInit) {
    super(init);
    this.name = 'TkawenRateLimitError';
    this.retryAfter = retryAfterOf(init.body, init.headers);
  }
}

/** Seconds to wait, from `retry_after` in the body (preferred: CORS hides the header) or `Retry-After`. */
export function retryAfterOf(body: unknown, headers?: Headers): number | null {
  const fromBody = isObject(body) ? body['retry_after'] : undefined;
  const n = typeof fromBody === 'number' ? fromBody : typeof fromBody === 'string' ? Number(fromBody) : NaN;
  if (Number.isFinite(n) && n >= 0) return n;
  const h = headers?.get('retry-after');
  if (h != null && h.trim() !== '') {
    const secs = Number(h);
    if (Number.isFinite(secs) && secs >= 0) return secs;
    const at = Date.parse(h);
    if (Number.isFinite(at)) return Math.max(0, Math.ceil((at - Date.now()) / 1000));
  }
  return null;
}

/** Builds the right subclass for a status code. */
export function createApiError(init: TkawenApiErrorInit): TkawenApiError {
  switch (init.status) {
    case 401:
      return new TkawenUnauthorizedError(init);
    case 403:
      return new TkawenForbiddenError(init);
    case 404:
      return new TkawenNotFoundError(init);
    case 422:
      return new TkawenValidationError(init);
    case 423:
      return new TkawenLessonLockedError(init);
    case 429:
      return new TkawenRateLimitError(init);
    default:
      return new TkawenApiError(init);
  }
}

/** Type guard usable across bundles (does not rely on `instanceof` alone). */
export function isTkawenApiError(e: unknown): e is TkawenApiError {
  return e instanceof TkawenApiError || (isObject(e) && typeof e['status'] === 'number' && typeof e['kind'] === 'string' && 'operationId' in e);
}
