# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

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
