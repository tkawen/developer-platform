# @tkawen/verify

Certificate verification for any website, in one line. The package has **zero runtime dependencies**. It gives you:

- `verifyCertificate()`: a small client for Node 18+ and browsers
- `<tkawen-verify>`: a web component with shadow DOM. It supports Arabic (RTL), French and English, uses Western numerals, is accessible, and loads no external fonts or scripts.

It reads two public endpoints that already exist:

| provider | endpoint | limit |
|---|---|---|
| `academy`: TKAWEN OS academies | `GET https://{academy}.tkawen.com/api/v1/verify/{code}` | 10/min, 300/day per IP |
| `certify`: Algeria Certify | `GET https://algeriacertify.com/api/public/v1/certificate/{token}` (default) or `/api/v1/public/verify/{token}` | 60/min / 30/min per IP |

Field-by-field evidence for each endpoint is in [ENDPOINTS.md](./ENDPOINTS.md).

> **Status: 0.1.0, not published yet.** The install and CDN lines below work only after the first `npm publish`.

## Install

```sh
npm install @tkawen/verify
```

## One-line embed (script tag)

```html
<script src="https://cdn.jsdelivr.net/npm/@tkawen/verify@0.1/dist/tkawen-verify.iife.js" defer></script>
<!-- or: https://unpkg.com/@tkawen/verify@0.1/dist/tkawen-verify.iife.js -->

<tkawen-verify code="AC-2026-0001" provider="certify" lang="fr"></tkawen-verify>
```

For production, pin an exact version and add Subresource Integrity:

```html
<script src="https://cdn.jsdelivr.net/npm/@tkawen/verify@0.1.0/dist/tkawen-verify.iife.js"
        integrity="sha384-…" crossorigin="anonymous" defer></script>
```

The bundle registers `<tkawen-verify>` and exposes `window.TkawenVerify` (the same API as the npm module).

### Form mode

If you leave out `code`, the element shows a labelled input and a button, so visitors can type a code themselves:

```html
<tkawen-verify provider="certify" lang="ar"></tkawen-verify>
```

### Attributes

| attribute | values | notes |
|---|---|---|
| `code` | certificate code | Without it, the element runs in form mode. Changing it verifies again. |
| `provider` | `academy` (default) · `certify` | |
| `academy` | subdomain slug, e.g. `code` | Required for `academy` unless `base-url` is set. |
| `base-url` | `https://…` origin | Overrides the host (staging, `.tkawen.online`, self-hosted). Plain `http` is allowed only for localhost. |
| `certify-endpoint` | `certificate` (default) · `verify` | Chooses between the two Algeria Certify endpoints. |
| `lang` | `ar` · `fr` · `en` | Falls back to the nearest `[lang]` ancestor, then `en`. `ar` renders RTL. |

The element sets `state="loading|valid|revoked|expired|invalid|not-found|rate-limited|error"` on itself, so you can style it from outside. It also dispatches a `tkawen-verify` event (bubbles, composed) whose `detail` is the `VerifyResult`. You can style its insides through the `part`s `card`, `form`, `input`, `button`, `result` and `link`.

## ES module / Node

```js
import { verifyCertificate } from '@tkawen/verify';

const r = await verifyCertificate({ code: 'TK-2026-000123', provider: 'academy', academy: 'code' });
if (r.valid) console.log(r.holderName, r.courseName, r.issuedAt);
```

```js
import '@tkawen/verify/element'; // registers <tkawen-verify> (browser)
```

### `verifyCertificate(options): Promise<VerifyResult>`

This function **never throws**. Every failure comes back as `status: 'error'`.

| option | type | |
|---|---|---|
| `code` | `string` | Required. Trimmed before use. Academy codes may use `[A-Za-z0-9._:-]`; Certify codes may use `[A-Za-z0-9_-]`, up to 128 characters. |
| `provider` | `'academy' \| 'certify'` | Required. |
| `academy` | `string` | Academy subdomain. |
| `baseUrl` | `string` | Origin override. |
| `certifyEndpoint` | `'certificate' \| 'verify'` | Default `certificate`. |
| `fetch` | `typeof fetch` | Custom fetch. Defaults to `globalThis.fetch`. |
| `timeoutMs` | `number` | Default `10000`. |
| `signal` | `AbortSignal` | |

```ts
interface VerifyResult {
  valid: boolean;              // true only when status === 'valid'
  status: 'valid' | 'revoked' | 'expired' | 'invalid' | 'not-found' | 'rate-limited' | 'error';
  reason?: string;             // the server's own status string: 'tampered', 'active', …
  code: string;
  holderName?: string;         // academy student_name | certify fullname
  courseName?: string;         // academy course_title | certify course
  issuedAt?: string;           // as sent by the server
  expiresAt?: string;          // certify only
  credentialId?: string;       // academy credential_uid | certify token
  issuer: { provider: 'academy' | 'certify'; name?: string; slug?: string; profileUrl?: string };
  verifyUrl: string;           // the issuer's human verification page
  retryAfter?: number;         // seconds, when the server says so
  httpStatus?: number;
  error?: 'invalid_input' | 'network' | 'timeout' | 'bad_response' | 'http_error';
  errorMessage?: string;
  raw: unknown;                // the parsed body, untouched
}
```

`normaliseAcademy(body, httpStatus, ctx)`, `normaliseCertify(body, httpStatus, ctx)` and `resolveUrls(options)` are exported too, for server-side use.

## States

| state | academy | Algeria Certify |
|---|---|---|
| `valid` | `status: "valid"` (signature verified on the server) | `status: "active"`, not past `expires_at` |
| `revoked` | `status: "revoked"` | `status: "revoked"` (or DB status other than `active`) |
| `expired` | never: academies have no expiry | `status: "expired"`, or `expires_at` in the past |
| `invalid` | `unsigned`, `tampered`, `unknown_key`, `invalid_signature` | n/a |
| `not-found` | HTTP 404 | HTTP 404 |
| `rate-limited` | HTTP 429 | HTTP 429 |
| `error` | network, CORS, timeout, non-JSON response or unknown status | same |

The widget never turns an unknown answer into `valid`.

## CORS requirement (read this before embedding)

| provider | Can a browser on a third-party site call it? |
|---|---|
| `certify` | **Yes.** Algeria Certify serves `api/*` with `Access-Control-Allow-Origin: *`. |
| `academy` | **Only from `*.tkawen.com` / `*.tkawen.online` pages.** Until a pending server update is deployed, on any other site the browser blocks the response and the widget shows **error**. |

To make academy verification embeddable anywhere, the kernel has to send `Access-Control-Allow-Origin: *`, without credentials, on `GET /api/v1/verify/{code}`, including its 404 and 429 responses. ENDPOINTS.md describes the exact change. Until that change ships, you have three options for academy certificates: use the widget on TKAWEN hosts, call `verifyCertificate()` from your own server (CORS does not apply there), or link to `https://{academy}.tkawen.com/certificates/verify/{code}`.

Cross-origin pages cannot read the `Retry-After` header (it is not exposed), so `retryAfter` comes from the `retry_after` field in the response body when the server sends one.

## Security

- **Read-only.** Every request is a single `GET` with `credentials: 'omit'` and only an `Accept` header (a CORS "simple" request, so there is no preflight). The package uses no tokens, API keys, cookies or storage.
- Server text is always inserted with `textContent`, never as HTML. URLs from the response are used only if they are `http(s)`.
- Input is validated before any request is made (code charset, academy slug, `https` base URL).
- The package reports the **issuer's** verdict. It does not check signatures on its own. Academy signatures are checked on the server. Algeria Certify's `integrity.signature` is an HMAC, which a third party cannot verify.
- Every lookup is logged by the issuer (academy: `certificate_verifications`), and both issuers rate-limit per IP.

See [SECURITY.md](./SECURITY.md) to report a vulnerability.

## Development

```sh
npm install
npm test          # vitest + happy-dom, fetch is always mocked
npm run build     # esbuild → dist/{index.js,index.cjs,element.js,tkawen-verify.iife.js} + .d.ts
```

The runtime supports Node ≥ 18. The dev toolchain (vitest 5) needs Node 22.12 or newer. Open `examples/index.html` after building to see every state. It uses mock responses unless you add `?live=1`.

---

## العربية

**@tkawen/verify** يتحقّق من شهادة بسطر واحد، ولا يحتاج أيّ مكتبة أخرى.

```html
<script src="https://cdn.jsdelivr.net/npm/@tkawen/verify@0.1/dist/tkawen-verify.iife.js" defer></script>
<tkawen-verify code="AC-2026-0001" provider="certify" lang="ar"></tkawen-verify>
```

- إذا لم تضع `code` يظهر حقل إدخال وزرّ، فيكتب الزائر الرمز بنفسه.
- الحالات: صحيحة، مسحوبة، منتهية الصلاحية، تعذّر إثبات التوقيع، غير موجودة، محاولات كثيرة، خطأ اتصال.
- الأرقام غربية (0-9) دائمًا، والاتجاه من اليمين إلى اليسار مع `lang="ar"`.
- **تنبيه CORS:** شهادات Algeria Certify تعمل من أيّ موقع. أمّا شهادات الأكاديميات فلا تعمل حاليًّا إلّا من صفحات ‎`*.tkawen.com`‎، وتشغيلها في مواقع أخرى يتطلّب تعديلًا في الخادم مشروحًا في ENDPOINTS.md.
- المكتبة للقراءة فقط: لا مفاتيح ولا كوكيز ولا تخزين.

## Français

**@tkawen/verify** vérifie un certificat en une ligne, sans aucune dépendance.

```html
<script src="https://cdn.jsdelivr.net/npm/@tkawen/verify@0.1/dist/tkawen-verify.iife.js" defer></script>
<tkawen-verify code="TK-2026-000123" provider="academy" academy="code" lang="fr"></tkawen-verify>
```

- Sans l'attribut `code`, le composant affiche un champ de saisie et un bouton.
- États : valide, révoqué, expiré, signature non vérifiée, introuvable, trop de tentatives, erreur.
- **CORS :** Algeria Certify accepte les appels depuis n'importe quel site. Les académies TKAWEN n'acceptent pour l'instant que les pages `*.tkawen.com` ; la modification serveur nécessaire est décrite dans ENDPOINTS.md.
- Lecture seule : ni jeton, ni cookie, ni stockage.

## License

MIT © TKAWEN
