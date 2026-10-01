import type { components, operations } from './schema.js';

export type { components, operations, paths } from './schema.js';

/** Every operationId in the spec (46). */
export type OperationId = keyof operations;

type JsonContent<R> = R extends { content: { 'application/json': infer B } } ? B : never;
type Responses<K extends OperationId> = operations[K]['responses'];

/** The JSON body of a 200/201 answer of operation `K`, straight from the spec. */
export type SuccessBody<K extends OperationId> = {
  [S in keyof Responses<K>]: S extends 200 | 201 ? JsonContent<Responses<K>[S]> : never;
}[keyof Responses<K>];

/** The JSON body of a given status of operation `K`. */
export type ResponseBody<K extends OperationId, S extends keyof Responses<K>> = JsonContent<Responses<K>[S]>;

/** Query parameters of operation `K`. */
export type QueryOf<K extends OperationId> = NonNullable<operations[K]['parameters']['query']>;

/** JSON request body of operation `K`. */
export type BodyOf<K extends OperationId> =
  NonNullable<operations[K]['requestBody']> extends { content: { 'application/json': infer B } } ? B : never;

type Schemas = components['schemas'];
export type Course = Schemas['Course'];
export type CourseLevel = Schemas['CourseLevel'];
export type Module = Schemas['Module'];
export type Lesson = Schemas['Lesson'];
export type LessonDetail = Schemas['LessonDetail'];
export type LessonLock = Schemas['LessonLock'];
export type Cart = Schemas['Cart'];
export type Order = Schemas['Order'];
export type Payment = Schemas['Payment'];
export type Enrollment = Schemas['Enrollment'];
export type MyCourse = Schemas['MyCourse'];
export type StudentDashboard = Schemas['StudentDashboard'];
export type Transcript = Schemas['Transcript'];
export type StudentRequest = Schemas['StudentRequest'];
export type WishlistItem = Schemas['WishlistItem'];
export type WishlistType = Schemas['WishlistType'];
export type CertificateStatus = Schemas['CertificateStatus'];
export type InstitutionMetrics = Schemas['InstitutionMetrics'];
export type InstitutionMetricsOwner = Schemas['InstitutionMetricsOwner'];
export type InstitutionMetricsInstructor = Schemas['InstitutionMetricsInstructor'];
export type TokenAbility = Schemas['TokenAbility'];
export type IssuedToken = Schemas['IssuedToken'];
export type TokenInfo = Schemas['TokenInfo'];
export type ApiUser = Schemas['ApiUser'];
export type InsufficientAbilityErrorBody = Schemas['InsufficientAbilityError'];
export type IdempotencyErrorBody = Schemas['IdempotencyError'];

/** Anything shaped like the global `fetch`. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface RetryOptions {
  /** Retry once after a 429, waiting `retry_after` seconds. Default false (opt-in). */
  on429?: boolean;
  /** Do not retry when the server asks to wait longer than this (seconds). Default 60. */
  maxWaitSeconds?: number;
}

export interface ClientOptions {
  /** Academy subdomain on tkawen.com, e.g. `"demo"` for https://demo.tkawen.com. */
  academy: string;
  /** Override the API root. Default `https://${academy}.tkawen.com/api/v1`. https only (http allowed for localhost). */
  baseUrl?: string;
  /** Sanctum personal access token. Sent as `Authorization: Bearer` only when set. */
  token?: string;
  /** Custom fetch (tests, proxies, older runtimes). Default: the global `fetch`. */
  fetch?: FetchLike;
  /** Sent as `Accept-Language` (e.g. `ar`, `fr`, `en`). */
  locale?: string;
  /** Opt-in single retry on 429. */
  retry?: RetryOptions;
  /** Extra headers sent with every request (cannot set Authorization). */
  headers?: Record<string, string>;
  /**
   * `Idempotency-Key` for `createCheckoutOrder` and `settleFreeOrder` when the call does not pass one.
   * `'off'` (default): no header unless `idempotencyKey` is passed per call. `'auto'`: a fresh
   * `crypto.randomUUID()` per call. A function: called once per call to produce the key.
   * A per-call key protects your own retries; an automatic key only protects the SDK's internal 429 retry.
   * @remarks Server support is pending deployment; until then the header is ignored.
   */
  idempotency?: 'off' | 'auto' | (() => string);
}

/** Per-call options accepted by every method as its last argument. */
export interface RequestOptions {
  signal?: AbortSignal;
  /** Extra headers for this call (cannot set Authorization). */
  headers?: Record<string, string>;
}

/** Per-call options of the cart/checkout operations (guest cart key). */
export interface CartRequestOptions extends RequestOptions {
  /** Guest cart key, sent as `X-Cart-Key` (max 64 chars). */
  cartKey?: string;
}

/** Per-call options of the operations that accept an `Idempotency-Key` (`settleFreeOrder`). */
export interface IdempotentRequestOptions extends RequestOptions {
  /**
   * Sent as `Idempotency-Key` (1-255 visible ASCII characters). Reuse the same key when you retry the same
   * request: the server replays the first 2xx answer instead of running it again (for 24 hours).
   * @remarks Server support is pending deployment; until then the header is ignored.
   */
  idempotencyKey?: string;
}

/** Per-call options of `createCheckoutOrder` (guest cart key and idempotency key). */
export interface CheckoutRequestOptions extends CartRequestOptions, IdempotentRequestOptions {}

/** Rate-limit headers of an answer (`X-RateLimit-*`), when the server sent them. */
export interface RateLimitInfo {
  limit: number | null;
  remaining: number | null;
  /** Unix time (seconds) when the window resets. */
  reset: number | null;
}

/** Transport metadata of a successful answer, read with `getResponseMeta(result)`. */
export interface ResponseMeta {
  status: number;
  /** True when the server answered with `Idempotent-Replayed: true` (a replay of an earlier request with the same key). */
  replayed: boolean;
  /** The `Idempotency-Key` that was sent, if any (useful with `idempotency: 'auto'`). */
  idempotencyKey: string | null;
  rateLimit: RateLimitInfo | null;
  headers: Headers;
}

/** Result of `downloadAssignmentSubmissionFile`. */
export interface DownloadedFile {
  data: Blob;
  contentType: string | null;
  filename: string | null;
}
