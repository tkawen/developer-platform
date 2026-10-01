# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## 0.2.0 — 2026-10-01

Follows `openapi/tkawen-os-v1.yaml` with 46 operations. The new server behaviour is marked
`x-status: pending-deployment` in the spec and `@remarks pending deployment` in the JSDoc. The SDK
can already send it, but production does not serve it yet.

### Added
- `issueToken` (`POST /auth/token`, alias `createToken`): exchanges e-mail and password for an expiring
  token with abilities. The password is sent once and is never kept by the client.
- `revokeToken` (`DELETE /auth/token`, resolves to `void`) and `getAuthenticatedCaller`
  (`GET /auth/me`, alias `getMe`).
- `client.withToken(token)` returns a new client that uses the token. `client.setToken(token)` switches
  the current client to it. The token stays private, is non-enumerable and is never serialised.
- `idempotencyKey` per-call option on `createCheckoutOrder` and `settleFreeOrder`, sent as
  `Idempotency-Key`. Malformed keys are refused before any request is sent.
- Client option `idempotency: 'off' | 'auto' | () => string`. `'auto'` generates one
  `crypto.randomUUID()` per call, which needs Node 19+ or a browser. The key is resent on the opt-in 429 retry.
- `getResponseMeta(result)` returns `{ status, replayed, idempotencyKey, rateLimit, headers }` for any
  successful result. `replayed` reads `Idempotent-Replayed: true`, and `rateLimit` reads `X-RateLimit-*`.
  Return types are unchanged.
- `TkawenInsufficientAbilityError` (403 `insufficient_ability`, `requiredAbility`). It is a subclass of
  `TkawenForbiddenError`, and `kind` stays `'forbidden'`.
- `TkawenIdempotencyError` (`kind: 'idempotency'`, `code`, `retryAfter`) for 400 `invalid_idempotency_key`,
  409 `idempotency_request_in_progress` and 422 `idempotency_key_reused`. The mapping applies only
  when both the status and the `error` code match the spec.
- `REQUIRED_ABILITY`: the token ability each operation needs, taken from `x-token-ability`.
- Type aliases `TokenAbility`, `IssuedToken`, `TokenInfo`, `ApiUser`, `InstitutionMetricsOwner`,
  `InstitutionMetricsInstructor`, `CheckoutRequestOptions`, `IdempotentRequestOptions` and `ResponseMeta`.

### Changed
- `src/schema.d.ts` is regenerated with openapi-typescript 7.13.0.
- `InstitutionMetrics` is now a union keyed by `scope` (`institution` | `instructor`). Code that read
  owner fields directly has to narrow on `scope` first. Production still answers with the owner shape
  and no `scope` until the server release.
- `TkawenErrorKind` gains `'idempotency'`.
- `VERSION` is now `'0.2.0'`. It was still `'0.1.0'` in 0.1.1.

## 0.1.1 — 2026-09-30

- Add repository, homepage and bugs links (github.com/tkawen/developer-platform).
- Documentation: remove internal implementation references from comments and docs.

## [0.1.0] - 2026-09-30 (unreleased)

### Added
- `createClient({ academy, baseUrl?, token?, fetch?, locale?, retry?, headers? })`.
- One method for each of the 43 operations in `openapi/tkawen-os-v1.yaml`. Method names
  are the operationIds. Methods are grouped by spec tag and also exposed flat.
- Types generated with `openapi-typescript` 7.13.0 (`src/schema.d.ts`), plus the helpers
  `SuccessBody`, `QueryOf`, `BodyOf` and `ResponseBody`.
- Typed errors: `TkawenApiError` and the subclasses for 401, 403, 404, 422 (`errors` map),
  423 (`needs`, `needsSlug`) and 429 (`retryAfter`).
- An opt-in single retry after a 429 that honours `retry_after` or `Retry-After`.
- JSDoc `@remarks known server defect` on `createCheckoutOrder` and `getMyEnrollmentTimeline`
  (from the spec's `x-known-defect`).
- ESM and CJS builds with TypeScript declarations.
