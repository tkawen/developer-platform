/** Which issuer answers the verification. */
export type Provider = 'academy' | 'certify';

/**
 * Algeria Certify exposes two public endpoints:
 *  - `certificate` → GET /api/public/v1/certificate/{token}  (embed endpoint, computes expiry, default)
 *  - `verify`      → GET /api/v1/public/verify/{token}       (full API: integrity block, VTI score)
 */
export type CertifyEndpoint = 'certificate' | 'verify';

/**
 * Normalised verdict.
 *  - valid         the issuer vouches for the certificate right now
 *  - revoked       the issuer withdrew it
 *  - expired       past its expiry date (Algeria Certify only; academies have no expiry)
 *  - invalid       the record exists but its signature check failed on the server
 *                  (academy: unsigned | tampered | unknown_key | invalid_signature)
 *  - not-found     no certificate with that code
 *  - rate-limited  HTTP 429, try again later
 *  - error         network / CORS / timeout / unexpected response / bad input
 */
export type VerifyStatus =
  | 'valid'
  | 'revoked'
  | 'expired'
  | 'invalid'
  | 'not-found'
  | 'rate-limited'
  | 'error';

export type VerifyErrorCode =
  | 'invalid_input'
  | 'network'
  | 'timeout'
  | 'bad_response'
  | 'http_error';

export interface VerifyIssuer {
  provider: Provider;
  /** Issuer display name when the endpoint returns one (Algeria Certify only). */
  name?: string;
  /** Academy subdomain or Algeria Certify institution slug. */
  slug?: string;
  profileUrl?: string;
}

export interface VerifyResult {
  /** True only when status === 'valid'. */
  valid: boolean;
  status: VerifyStatus;
  /** The server's own status string, untouched (e.g. `tampered`, `active`, `not_found`). */
  reason?: string;
  /** The code that was checked (trimmed). */
  code: string;
  holderName?: string;
  courseName?: string;
  /** As returned by the server (ISO-8601 for academy and the certify embed endpoint). */
  issuedAt?: string;
  expiresAt?: string;
  /** Stable credential id (academy `credential_uid`, certify `token`). */
  credentialId?: string;
  issuer: VerifyIssuer;
  /** Human verification page for this code on the issuer's own site. */
  verifyUrl: string;
  /** Seconds to wait, when rate-limited and the server said so in the body. */
  retryAfter?: number;
  httpStatus?: number;
  error?: VerifyErrorCode;
  errorMessage?: string;
  /** Parsed JSON body exactly as received (undefined on network errors). */
  raw: unknown;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface VerifyOptions {
  /** Printed certificate code, academy credential_uid, or Algeria Certify token. */
  code: string;
  provider: Provider;
  /** Academy subdomain, e.g. `code` for https://code.tkawen.com. Required for provider "academy" unless baseUrl is set. */
  academy?: string;
  /** Override the origin, e.g. `https://code.tkawen.online` or a staging host. No trailing path. */
  baseUrl?: string;
  /** Algeria Certify endpoint choice. Default `certificate`. */
  certifyEndpoint?: CertifyEndpoint;
  /** Custom fetch (tests, server runtimes). Defaults to globalThis.fetch. */
  fetch?: FetchLike;
  /** Abort after this many ms. Default 10000. */
  timeoutMs?: number;
  /** External abort signal. */
  signal?: AbortSignal;
}
