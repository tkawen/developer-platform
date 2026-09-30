# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## 0.1.1 — 2026-09-30

- Add repository, homepage and bugs links (github.com/tkawen/developer-platform).
- Documentation: remove internal implementation references from comments and docs.

## [0.1.0] - 2026-09-30 (unreleased)

### Added
- `verifyCertificate()`: a client for the TKAWEN OS academy endpoint
  (`/api/v1/verify/{code}`) and both Algeria Certify public endpoints
  (`/api/public/v1/certificate/{token}` and `/api/v1/public/verify/{token}`).
  It never throws; every failure is returned as `status: 'error'`.
- A normalised `VerifyResult` with the statuses `valid`, `revoked`, `expired`,
  `invalid`, `not-found`, `rate-limited` and `error`, plus the untouched `raw` body.
- The `<tkawen-verify>` web component: shadow DOM, ar/fr/en, RTL for Arabic,
  Western numerals, an `aria-live` status region, form mode, a `tkawen-verify`
  result event, and style hooks through `part`.
- ESM, CJS and a minified IIFE bundle (`window.TkawenVerify`), with TypeScript
  declarations.
- ENDPOINTS.md: source-level evidence for each endpoint, and the CORS verdict.

### Known limitations
- Browsers can call the academy endpoint only from `*.tkawen.com` and
  `*.tkawen.online` origins until the kernel's CORS policy changes (see ENDPOINTS.md).
