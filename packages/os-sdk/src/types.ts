import type { components, operations } from './schema.js';

export type { components, operations, paths } from './schema.js';

/** Every operationId in the spec (43). */
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

/** Result of `downloadAssignmentSubmissionFile`. */
export interface DownloadedFile {
  data: Blob;
  contentType: string | null;
  filename: string | null;
}
