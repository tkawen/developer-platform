# TKAWEN developer platform

This repository holds the public developer surface of **TKAWEN OS**: a verified OpenAPI description of the tenant API (`https://{academy}.tkawen.com/api/v1`) and the npm packages built from it.

> **Status:** published on npm — [`@tkawen/verify`](https://www.npmjs.com/package/@tkawen/verify), [`@tkawen/os-sdk`](https://www.npmjs.com/package/@tkawen/os-sdk), [`@tkawen/os-mcp`](https://www.npmjs.com/package/@tkawen/os-mcp). MIT.

```bash
npm install @tkawen/os-sdk
npx -y @tkawen/os-mcp          # MCP server (set TKAWEN_ACADEMY)
```

## Layout

| path | what | status |
|---|---|---|
| [`openapi/`](./openapi) | `tkawen-os-v1.yaml` — OpenAPI 3.1 description of the TKAWEN OS academy API v1 (43 operations), derived from the kernel source | stable v1 |
| [`packages/verify`](./packages/verify) | `@tkawen/verify`: a zero-dependency certificate verification client and the `<tkawen-verify>` web component (TKAWEN academies and Algeria Certify) | [npm](https://www.npmjs.com/org/tkawen) |
| [`packages/os-sdk`](./packages/os-sdk) | `@tkawen/os-sdk`: a typed, zero-dependency client for all 43 operations. Types are generated from the spec with `openapi-typescript`, and errors are typed | [npm](https://www.npmjs.com/org/tkawen) |
| [`packages/os-mcp`](./packages/os-mcp) | `@tkawen/os-mcp`: a read-only MCP stdio server (catalogue, instructors, certificate verification and, with a token, the learner's own dashboard, courses and transcript) | [npm](https://www.npmjs.com/org/tkawen) |

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

## Release process

- Every maintainer of the `@tkawen` npm scope has 2FA enabled (auth and writes).
- Each package must pass `npm run typecheck && npm test && npm run build && npm pack --dry-run` before release.
- Publish `@tkawen/os-sdk` before `@tkawen/os-mcp`.
- Report security issues to security@tkawen.com (see each package's SECURITY.md).

## License

MIT © TKAWEN
