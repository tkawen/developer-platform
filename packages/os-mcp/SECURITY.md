# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x | yes |

## Reporting a vulnerability

Please do **not** open a public issue. Email **security@tkawen.com** (a placeholder address; confirm it exists before the first publish) with a description of the issue, its impact, steps to reproduce and the affected version. We aim to acknowledge reports within 3 working days.

## Scope and design

- **Read-only by construction.** The server registers only tools that call `GET`
  operations. It has no tool for cart, checkout, reviews, discussion, requests,
  wishlist, progress or assignments. All tools are annotated
  `readOnlyHint: true` and `destructiveHint: false`.
- **Token handling.** `TKAWEN_TOKEN` is read from the environment and sent only
  as `Authorization: Bearer` to the configured academy. It is never written to
  stdout or stderr, and any occurrence in tool output is replaced with
  `[redacted]`. Without a token, the learner tools are not registered at all.
- **Token nature.** TKAWEN OS tokens do not expire and have no scopes. An assistant with this server can read everything the
  token's owner can read through the listed tools. Use a dedicated account and
  revoke the token when you no longer need it.
- **Prompt injection.** Tool output is academy data (course titles,
  descriptions, reviews), which is untrusted text. Your MCP client should treat
  it as data, not instructions.
- **Host pinning.** `TKAWEN_ACADEMY` must be a single DNS label, and
  `TKAWEN_BASE_URL` must be https (plain http only for localhost).

In scope: token leakage, any path that turns a tool into a write, and host or
URL injection through tool arguments or environment variables.
