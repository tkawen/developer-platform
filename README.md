# TKAWEN developer platform

This repository holds the public developer surface of **TKAWEN OS**: a verified OpenAPI description of the tenant API (`https://{academy}.tkawen.com/api/v1`) and the npm packages built from it.

> **Status: 0.1.0, not yet published.** Nothing here is on npm. No package has been published, and nothing has been pushed to a remote.

## Layout

| path | what | status |
|---|---|---|
| [`openapi/`](./openapi) | `tkawen-os-v1.yaml` — OpenAPI 3.1 description of the TKAWEN OS academy API v1 (43 operations), derived from the kernel source | stable v1 |
| [`packages/verify`](./packages/verify) | `@tkawen/verify`: a zero-dependency certificate verification client and the `<tkawen-verify>` web component (TKAWEN academies and Algeria Certify) | 0.1.0, unpublished |
| [`packages/os-sdk`](./packages/os-sdk) | `@tkawen/os-sdk`: a typed, zero-dependency client for all 43 operations. Types are generated from the spec with `openapi-typescript`, and errors are typed | 0.1.0, unpublished |
| [`packages/os-mcp`](./packages/os-mcp) | `@tkawen/os-mcp`: a read-only MCP stdio server (catalogue, instructors, certificate verification and, with a token, the learner's own dashboard, courses and transcript) | 0.1.0, unpublished |

The packages are independent npm projects, and each has its own `package-lock.json`. The root `package.json` does **not** declare npm workspaces. A workspace root would take over `npm install` inside `packages/verify` and bypass that package's own lockfile. The root scripts just run each package in turn:

```sh
npm run install:all   # verify, os-sdk, then os-mcp (os-mcp links ../os-sdk)
npm run build         # os-sdk must be built before os-mcp typechecks/tests
npm test
npm run pack:check    # npm pack --dry-run for every package
```

## Important facts for API consumers

- The tenant is chosen by the **host** (`{academy}.tkawen.com`).
- **/api/v1 cannot issue tokens.** Login exists only on the legacy `POST /api/auth/login`. Tokens are Sanctum personal access tokens with **no expiry and no scopes**.
- Response and error envelopes are not uniform. The SDK keeps the server's shapes as they are and types each one from the spec.
- Two operations carry `x-known-defect` (`createCheckoutOrder`, `getMyEnrollmentTimeline`). Both are expected to answer 500 in specific cases. Fixes are pending deployment.

## Publishing checklist (do not skip any item)

- [ ] **Founder approval** of the public API surface, package names and licences (MIT, © TKAWEN).
- [ ] npm org `@tkawen` exists; every maintainer has **npm 2FA** enabled (auth *and* writes).
- [ ] Publish from **CI with provenance** (`npm publish --provenance`, GitHub Actions OIDC). Never publish from a laptop. `publishConfig.provenance` is already `true` in every package.
- [ ] **Secrets rotated** and none in the tree: run a secret scan, and confirm that no token, `.env` or real learner data sits in tests, fixtures or examples.
- [ ] `security@tkawen.com` exists (the SECURITY.md files reference it as a placeholder).
- [ ] Repository URLs in each `package.json` (`github:tkawen/developer-platform`, `github:tkawen/verify`) point at real public repositories.
- [ ] Order: publish `@tkawen/os-sdk` first. Then change `@tkawen/os-mcp`'s dependency from `file:../os-sdk` to `^0.1.0`, because its `prepublishOnly` refuses a `file:` dependency.
- [ ] Each package passes `npm run typecheck && npm test && npm run build && npm pack --dry-run` in CI.

## License

MIT © TKAWEN
