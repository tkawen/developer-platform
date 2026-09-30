# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

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
