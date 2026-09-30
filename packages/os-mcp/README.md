# @tkawen/os-mcp

This is a **read-only** [Model Context Protocol](https://modelcontextprotocol.io) server (stdio). It lets an AI assistant such as Claude Desktop or Claude Code read a TKAWEN OS academy's live catalogue, its instructors and its certificate verification. When you give it a learner token, it can also read that learner's own dashboard, courses and transcript.

It is built on [`@tkawen/os-sdk`](../os-sdk) and the official `@modelcontextprotocol/sdk`. Every call fetches data **live** from `https://{academy}.tkawen.com/api/v1`. **No tool writes anything.** The server has no cart, checkout, review, discussion, request, wishlist or progress tools.

> **Status: 0.1.0, not published yet.** The `npx` lines below work only after the first `npm publish`. Until then, point your client at `node <path>/packages/os-mcp/dist/cli.js`.

## Tools

| tool | needs token | SDK operation |
|---|---|---|
| `list_courses` | no | `listCourses` (filters: q, category, level, language, price, sort, per_page, page) |
| `get_course` | no | `getCourse` |
| `list_instructors` | no | `listInstructors` |
| `get_instructor` | no | `getInstructor` |
| `get_catalogue_facets` | no | `getCatalogueFacets` |
| `verify_certificate` | no | `verifyCertificate` (logged by the academy; 10/min per IP) |
| `get_my_dashboard` | **yes** | `getMyDashboard` |
| `list_my_courses` | **yes** | `listMyCourses` |
| `get_my_transcript` | **yes** | `getMyTranscript` |

The three token tools are registered only when `TKAWEN_TOKEN` is set. `get_course_locks` is not provided because its operation (`getCourseLocks`) requires a token, and this server exposes only the tools listed above. All tools carry the annotations `readOnlyHint: true` and `destructiveHint: false`.

API errors come back as MCP error results (`isError: true`) in the form `TKAWEN API error <status> (<kind>) on <operationId>: <message>`. For a locked lesson the result adds `needs`/`needs_slug`, and for a 429 it adds the retry delay. The token is never echoed: any occurrence in output is replaced with `[redacted]`.

## Configuration (environment)

| variable | required | meaning |
|---|---|---|
| `TKAWEN_ACADEMY` | yes | Academy subdomain, e.g. `demo` for `demo.tkawen.com` |
| `TKAWEN_BASE_URL` | no | Override the API root (https only; http allowed for localhost) |
| `TKAWEN_TOKEN` | no | Learner's Sanctum token. It enables the three `my` tools |
| `TKAWEN_LOCALE` | no | `ar`, `fr` or `en`, sent as `Accept-Language` |

/api/v1 cannot issue tokens. A learner token comes from the academy's legacy `POST /api/auth/login`. Tokens do not expire and have no scopes, so give this server a token only on a machine you trust, and prefer a dedicated account.

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "tkawen-os": {
      "command": "npx",
      "args": ["-y", "@tkawen/os-mcp"],
      "env": {
        "TKAWEN_ACADEMY": "demo",
        "TKAWEN_LOCALE": "ar"
      }
    }
  }
}
```

Add `"TKAWEN_TOKEN": "<learner token>"` to `env` to enable the learner tools.

### Claude Code

```sh
claude mcp add tkawen-os --env TKAWEN_ACADEMY=demo --env TKAWEN_LOCALE=ar -- npx -y @tkawen/os-mcp
```

or in `.mcp.json`:

```json
{
  "mcpServers": {
    "tkawen-os": {
      "command": "npx",
      "args": ["-y", "@tkawen/os-mcp"],
      "env": { "TKAWEN_ACADEMY": "demo" }
    }
  }
}
```

## Programmatic use

```ts
import { startServer } from '@tkawen/os-mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

await startServer({ env: process.env, transport: new StdioServerTransport() });
```

## Development

```sh
npm install      # links @tkawen/os-sdk from ../os-sdk (build it first)
npm test         # SDK mocked + an in-process smoke test; no network
npm run build
```

Before publishing, publish `@tkawen/os-sdk` first and replace `"@tkawen/os-sdk": "file:../os-sdk"` with `"^0.1.0"`. The `prepublishOnly` script refuses to publish while the dependency is still local.

## License

MIT © TKAWEN
