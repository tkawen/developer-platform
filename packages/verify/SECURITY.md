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
mitigation within 30 days. We will credit you in the release notes unless you
ask us not to.

## Scope and design

- The package is **read-only**. Each call makes one `GET` request to a public
  verification endpoint, with `credentials: 'omit'` and no custom headers other
  than `Accept`.
- It handles no secrets: no API keys, no tokens, no cookies, and nothing in
  `localStorage`.
- Response text is always rendered with `textContent`. The only markup the
  component injects is its own static SVG icons.
- Only `http(s)` URLs taken from a response are ever used as links. Links open
  with `rel="noopener noreferrer"`.
- A result is only as trustworthy as the issuer's answer. The package reports
  that answer; it does not verify cryptographic signatures itself.

In scope: XSS or HTML injection through server data, request smuggling through
the `code`, `academy` or `base-url` inputs, and any way to make a revoked,
unknown or erroring certificate display as valid.
Out of scope: the rate limits and data of the issuer endpoints themselves.
Report those to the issuer (TKAWEN or Algeria Certify).
