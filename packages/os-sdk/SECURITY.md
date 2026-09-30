# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x | yes |

## Reporting a vulnerability

Please do **not** open a public issue. Email **security@tkawen.com** with:

- a description of the issue and its impact
- steps to reproduce, or a proof of concept
- the affected version

We aim to acknowledge reports within 3 working days and to ship a fix or a
mitigation within 30 days.

## Scope and design

- **Tokens.** The SDK sends the token you give it as `Authorization: Bearer` and
  nowhere else. It keeps the token in a private class field, never logs it, and
  never includes it in error messages, error URLs or `JSON.stringify(client)`.
  Neither the client options nor per-call headers can override `Authorization`.
- **Host pinning.** `academy` must be a single DNS label, so it cannot redirect
  requests to another host. `baseUrl` must be https; plain http is allowed only
  for localhost. URLs that embed credentials are refused.
- **Path safety.** Every path parameter goes through `encodeURIComponent`.
- **Retries.** Retries are opt-in, happen at most once, and only after a 429.
  The server throttle answers a 429 before the handler runs.
- **Token nature.** TKAWEN OS tokens are Sanctum personal access tokens. They
  have no expiry and no scopes. Treat them as
  passwords. Do not ship a learner's token inside a public web page.

In scope: token leakage, host or URL injection through the client inputs, and
request smuggling through path, query or header values.
Out of scope: server-side defects of the TKAWEN OS API. Those are listed in
Suspected security issues should be reported to TKAWEN (see below).
