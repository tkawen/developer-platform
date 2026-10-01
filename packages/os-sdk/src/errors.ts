/**
 * Typed errors for every non-2xx answer of the TKAWEN OS API.
 *
 * The API has several error envelopes (see the spec description):
 * `{message}`, `{message, errors}` (422), `{error}`, `{message, error: "lesson_locked", needs, needs_slug}` (423),
 * `{message, retry_after}` (429), `{status: "not_found"}` (verification),
 * `{message, error: "insufficient_ability", required_ability}` (403) and
 * `{message, error: "invalid_idempotency_key" | "idempotency_request_in_progress" | "idempotency_key_reused"}`
 * (400 / 409 / 422). The classes below read all of them.
 */

export type TkawenErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'lesson_locked'
  | 'rate_limited'
  | 'idempotency'
  | 'http';

/** Abilities a v1 token can carry (`*` is the legacy full-access ability). */
export type TkawenTokenAbility = 'read' | 'learn' | 'purchase' | 'requests' | '*';

/** The `error` codes of the spec's `IdempotencyError` body. */
export type TkawenIdempotencyErrorCode = 'invalid_idempotency_key' | 'idempotency_request_in_progress' | 'idempotency_key_reused';

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

const ABILITIES: readonly string[] = ['read', 'learn', 'purchase', 'requests', '*'];

/**
 * 403 `insufficient_ability`: the bearer token does not carry the ability this operation needs
 * (see `REQUIRED_ABILITY`). A subclass of `TkawenForbiddenError`, so `kind` stays `'forbidden'`.
 * @remarks Server behaviour pending deployment.
 */
export class TkawenInsufficientAbilityError extends TkawenForbiddenError {
  /** The ability the operation needs, from `required_ability` (null if the server sent an unknown value). */
  readonly requiredAbility: TkawenTokenAbility | null;
  constructor(init: TkawenApiErrorInit) {
    super(init);
    this.name = 'TkawenInsufficientAbilityError';
    const v = isObject(init.body) ? init.body['required_ability'] : undefined;
    this.requiredAbility = typeof v === 'string' && ABILITIES.includes(v) ? (v as TkawenTokenAbility) : null;
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

/**
 * `Idempotency-Key` refusals of `createCheckoutOrder` / `settleFreeOrder`:
 * 400 `invalid_idempotency_key` (malformed key), 409 `idempotency_request_in_progress` (the first request with this
 * key is still running; retry after `retryAfter` seconds), 422 `idempotency_key_reused` (the key was already used with a
 * different body or order; use a new key).
 * @remarks Server behaviour pending deployment.
 */
export class TkawenIdempotencyError extends TkawenApiError {
  override readonly kind = 'idempotency' as const;
  readonly code: TkawenIdempotencyErrorCode;
  /** Seconds to wait before retrying (409 only; from `Retry-After`, null otherwise). */
  readonly retryAfter: number | null;
  constructor(init: TkawenApiErrorInit & { code: TkawenIdempotencyErrorCode }) {
    super(init);
    this.name = 'TkawenIdempotencyError';
    this.code = init.code;
    this.retryAfter = init.code === 'idempotency_request_in_progress' ? retryAfterOf(init.body, init.headers) : null;
  }
}

/** The documented (status, error code) pairs of the spec's `IdempotencyError`. */
const IDEMPOTENCY_CODES: Record<number, TkawenIdempotencyErrorCode> = {
  400: 'invalid_idempotency_key',
  409: 'idempotency_request_in_progress',
  422: 'idempotency_key_reused',
};

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
  const code = isObject(init.body) ? init.body['error'] : undefined;
  const idem = IDEMPOTENCY_CODES[init.status];
  if (idem !== undefined && code === idem) return new TkawenIdempotencyError({ ...init, code: idem });
  if (init.status === 403 && code === 'insufficient_ability') return new TkawenInsufficientAbilityError(init);
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
