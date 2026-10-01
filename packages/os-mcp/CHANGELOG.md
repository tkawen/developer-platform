# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## 0.2.0 — 2026-10-01

### Added
- The `whoami` tool, registered only when `TKAWEN_TOKEN` is set. It is read-only and calls the SDK's
  `getAuthenticatedCaller` (`GET /auth/me`). It returns the account behind the token and the token's
  abilities and expiry, never the token itself. **Pending deployment**: until the academy's server
  release, the tool returns an API error. Its description says so.

### Changed
- Depends on `@tkawen/os-sdk` `^0.2.0`.
- `SERVER_VERSION` is now `0.2.0`.

## 0.1.1 — 2026-09-30

- Add repository, homepage and bugs links (github.com/tkawen/developer-platform).
- Documentation: remove internal implementation references from comments and docs.
- Add `mcpName` for the official MCP registry.

## [0.1.0] - 2026-09-30 (unreleased)

### Added
- A stdio MCP server (`tkawen-os-mcp` bin) built on `@modelcontextprotocol/sdk` 1.31 (`McpServer.registerTool`) and zod 4.
- Public read-only tools: `list_courses`, `get_course`, `list_instructors`, `get_instructor`,
  `get_catalogue_facets` and `verify_certificate`.
- Token-only read-only tools, registered only when `TKAWEN_TOKEN` is set: `get_my_dashboard`,
  `list_my_courses` and `get_my_transcript`.
- API errors are mapped to MCP error results. The token is redacted from all output.
- A `prepublishOnly` guard that refuses to publish while a dependency is a local `file:` path.
