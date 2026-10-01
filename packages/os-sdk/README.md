# @tkawen/os-sdk

Typed client for the API of a TKAWEN OS academy (`https://{academy}.tkawen.com/api/v1`).

- It has **zero runtime dependencies** and runs on Node 18+ and in browsers. It uses the global `fetch`, and you can inject your own.
- It ships ESM and CommonJS builds with TypeScript declarations.
- Every type is **generated from the verified OpenAPI spec** [`openapi/tkawen-os-v1.yaml`](../../openapi/tkawen-os-v1.yaml) with `openapi-typescript`. The spec has 46 operations and the SDK exposes 46 methods. Each method is named after its `operationId`.

> **Status: 0.2.0.** Token issuance (`issueToken`, `revokeToken`, `getAuthenticatedCaller`), token abilities,
> `Idempotency-Key` on checkout/payment and the role-dependent metrics shape are in the spec as
> `x-status: pending-deployment`. The SDK supports them now, but **production does not serve them yet**:
> until the server release, `/auth/token` and `/auth/me` are not available and the `Idempotency-Key` header is ignored.

## Install

```sh
npm install @tkawen/os-sdk
```

## Quick start

```ts
import { createClient, TkawenLessonLockedError } from '@tkawen/os-sdk';

const tk = createClient({ academy: 'demo', locale: 'ar' });

const { data: courses, meta } = await tk.catalogue.listCourses({ q: 'بايثون', per_page: 12 });
const { data: course } = await tk.catalogue.getCourse(courses[0].slug);
const verdict = await tk.certificates.verifyCertificate('TKW-2026-000123');
```

### Log in (pending deployment)

```ts
import { createClient, TkawenValidationError } from '@tkawen/os-sdk';

const tk = createClient({ academy: 'demo' });
try {
  const { data } = await tk.createToken({   // alias of issueToken: POST /auth/token
    email: 'learner@example.com',
    password,                               // sent once, never stored by the client
    device_name: 'my-app',
    abilities: ['read', 'learn'],           // default: all four
  });
  const me = tk.withToken(data.access_token); // new client; `tk` stays anonymous
  // or: tk.setToken(data.access_token)
  console.log(data.expires_at);             // tokens expire (30 days by default)
  const { data: who } = await me.getMe();   // alias of getAuthenticatedCaller: user + token abilities
  await me.auth.revokeToken();              // revokes only this token
} catch (e) {
  if (e instanceof TkawenValidationError) console.log(e.errors.email); // wrong credentials
}
```

Store `access_token` like a password. The client never exposes it: `withToken` and `setToken` keep it in a private field, and `JSON.stringify(client)` does not include it.

With an existing token:

```ts
const me = createClient({ academy: 'demo', token: process.env.TKAWEN_TOKEN });
const dash = await me.me.getMyDashboard();

try {
  await me.learning.getLesson('lesson-3');
} catch (e) {
  if (e instanceof TkawenLessonLockedError) console.log('Finish first:', e.needs, e.needsSlug);
}
```

## Options

| option | default | notes |
|---|---|---|
| `academy` | required | Subdomain label, validated (`demo` gives `https://demo.tkawen.com/api/v1`) |
| `baseUrl` | derived from `academy` | Must be https. Plain http is allowed only for localhost |
| `token` | none | A Sanctum personal access token. `Authorization: Bearer` is sent only when it is set. The token is never exposed on the client or in errors |
| `fetch` | global `fetch` | Inject your own for tests or proxies |
| `locale` | none | Sent as `Accept-Language` |
| `retry` | `{ on429: false }` | Opt in to **one** automatic retry after a 429. It waits `retry_after` seconds (body first, then the `Retry-After` header) and gives up when the wait is longer than `maxWaitSeconds` (default 60) |
| `headers` | none | Extra headers. They can never override `Authorization` |
| `idempotency` | `'off'` | `'auto'` sends a fresh `crypto.randomUUID()` as `Idempotency-Key` on every `createCheckoutOrder` / `settleFreeOrder` call. It needs Node 19+ or a browser, or you can pass a function that returns a key |

Every method also accepts per-call options `{ signal, headers }` as its last argument. The cart and checkout methods also accept `cartKey`, which is sent as `X-Cart-Key`. `createCheckoutOrder` and `settleFreeOrder` also accept `idempotencyKey`.

The client also has `withToken(token)`, which returns a new client, `setToken(token)`, which switches this client, and the aliases `createToken` (for `issueToken`) and `getMe` (for `getAuthenticatedCaller`).

## Methods (grouped by spec tag, also available flat on the client)

| group | methods |
|---|---|
| `catalogue` | listCourses, getCourse, listRelatedCourses, listCourseReviews, submitCourseReview, getMyCourseReview, listInstructors, getInstructor, getCatalogueFacets, getSitemapFeed |
| `auth` | issueToken, revokeToken, getAuthenticatedCaller, listAuthProviders |
| `learning` | getCourseLocks, getLesson, getLessonCaptions, recordLessonProgress, listLessonDiscussion, postLessonDiscussion, submitLessonAssignment, downloadAssignmentSubmissionFile, getMyTranscript |
| `commerce` | listPaymentMethods, getCart, addCartItem, removeCartItem, createCheckoutOrder, settleFreeOrder, listMyPayments |
| `me` | listMyEnrollments, listMyEnrollmentsByPublicId, getMyEnrollmentTimeline, getMyDashboard, listMyCourses |
| `requests` | listMyRequests, createMyRequest, getMyRequest, postMyRequestMessage, cancelMyRequest |
| `wishlist` | listMyWishlist, addToMyWishlist, checkMyWishlist, removeFromMyWishlist |
| `staff` | getInstitutionMetrics |
| `certificates` | verifyCertificate |

Each method returns the response body exactly as the spec describes it. The envelopes differ between operations: some are wrapped in `data`, others are hand-built. The SDK does not reshape them. It deviates from the plain body in two places:

- `verifyCertificate` resolves a 404 to `{ status: "not_found" }` instead of throwing, because on that endpoint a 404 is a verdict.
- `downloadAssignmentSubmissionFile` resolves to `{ data: Blob, contentType, filename }`.

`getResponseMeta(result)` returns the transport metadata of any successful result: `status`, `replayed`, `idempotencyKey`, `rateLimit` (`X-RateLimit-*`) and `headers`. The result itself is not changed.

Useful type helpers are exported: `SuccessBody<'getCourse'>`, `QueryOf<'listCourses'>`, `BodyOf<'createMyRequest'>`, the schema aliases (`Course`, `Cart`, `Order`…), and the raw `paths`, `operations` and `components`.

## Errors

Every non-2xx response throws a `TkawenApiError` with `status`, `body` (the parsed server body), `method`, `url`, `operationId` and a `kind` discriminant:

| status | class | extra |
|---|---|---|
| 401 | `TkawenUnauthorizedError` | |
| 403 | `TkawenForbiddenError` | |
| 403 `insufficient_ability` | `TkawenInsufficientAbilityError` (a subclass of `TkawenForbiddenError`, `kind: 'forbidden'`) | `requiredAbility` |
| 400 / 409 / 422 with an idempotency `error` code | `TkawenIdempotencyError` (`kind: 'idempotency'`) | `code`, `retryAfter` (409) |
| 404 | `TkawenNotFoundError` | |
| 422 | `TkawenValidationError` | `errors: Record<string, string[]>`, which is empty for `{error}` refusals |
| 423 | `TkawenLessonLockedError` | `needs`, `needsSlug` |
| 429 | `TkawenRateLimitError` | `retryAfter` (seconds) |
| others (402, 409 already paid, 5xx…) | `TkawenApiError` | |

The message comes from `message`, then `error`, then `status` in the body. Messages are often Arabic, because the server writes them that way.

## Tokens and abilities

`POST /auth/token` (`issueToken`) issues a Sanctum personal access token (pending deployment). The token expires, 30 days by default, and carries **abilities**:

| ability | needed by |
|---|---|
| `read` | every GET |
| `learn` | progress, discussion posts, assignments, reviews, wishlist writes |
| `purchase` | cart writes, checkout, order payment |
| `requests` | creating, replying to and cancelling the learner's requests |

`REQUIRED_ABILITY` maps each operationId to its ability, or to `null` when no ability is needed (`issueToken`, `revokeToken`, `getAuthenticatedCaller`, `verifyCertificate`). The check applies only when a bearer token is sent, so anonymous calls to public operations are unaffected. A token without the ability gets `TkawenInsufficientAbilityError`. Ask for the smallest set you need.

Until the server release, tokens come only from the legacy unversioned `POST /api/auth/login`, which is outside this spec. Those tokens carry `*` (full access) and never expire. Registration and e-mail verification still live on the legacy routes.

## Idempotent checkout and payment (pending deployment)

```ts
import { randomUUID } from 'node:crypto';
import { getResponseMeta, TkawenIdempotencyError } from '@tkawen/os-sdk';

const key = randomUUID();                          // keep it for every retry of this checkout
const order = await me.createCheckoutOrder({ coupon: 'RENTREE' }, { idempotencyKey: key });
getResponseMeta(order)?.replayed;                  // true when the server replayed the first answer
```

A retry with the same key and body replays the first 2xx answer for 24 hours instead of creating a second order. Errors come back as `TkawenIdempotencyError`:

- `code` `invalid_idempotency_key` (400): the key is malformed. The SDK refuses keys that are not 1-255 visible ASCII characters before sending.
- `idempotency_request_in_progress` (409): the first request is still running. Wait `retryAfter` seconds and retry.
- `idempotency_key_reused` (422): the key was already used with another body. Use a new key.

The `idempotency: 'auto'` client option protects only the SDK's own 429 retry. To make your own retries safe, create the key yourself and reuse it. Until the server release, the header is ignored.

## Staff metrics

`getInstitutionMetrics` returns `InstitutionMetrics`, a union keyed by `scope`. `scope: 'institution'` is the academy-wide shape for owners. `scope: 'instructor'` covers the instructor's own courses, with no revenue. Narrow on `scope` before you read fields. Until the server release, production returns the owner shape without `scope` to every staff member.

## Known server defects (kept visible, not hidden)

The spec flags two operations with `x-known-defect`. They are marked with `@remarks known server defect` in the JSDoc:

- `createCheckoutOrder`: with no open cart **and** no `X-Cart-Key`, the server is expected to answer 500 instead of 404. Pass `cartKey` when you have one.
- `getMyEnrollmentTimeline`: expected to answer 500 for paid courses that have payment rows.

Both were found by static reading of the kernel and have not been verified at runtime.

## Regenerating types

```sh
npm run generate   # openapi-typescript ../../openapi/tkawen-os-v1.yaml -o src/schema.d.ts
```

---

## بالعربية

حزمة `@tkawen/os-sdk` عميل مُنمَّط (TypeScript) لواجهة `/api/v1` في أكاديميات TKAWEN OS. لا تعتمد على أي حزمة أخرى، وتعمل في Node 18+ وفي المتصفح. أنواعها كلّها مولَّدة من ملف OpenAPI الموثَّق، وفيه 46 عملية. أنشئ العميل بـ`createClient({ academy: 'demo' })`. ويُرسَل الرمز (token) في ترويسة `Authorization` فقط إذا مرّرته. الإصدار 0.2.0 يضيف `createToken` لإصدار رمز له صلاحيات (abilities) ومدة انتهاء، و`getMe` و`revokeToken`، و`withToken` للانتقال إلى الرمز بعد الدخول، ومفتاح `Idempotency-Key` لعمليتي الدفع والطلب. هذه الميزات موصوفة في المواصفة، لكنها لم تُنشر على الخادم بعد، فيبقى الرمز حتى ذلك الحين من المسار القديم `/api/auth/login`. تحمل الأخطاء أصنافًا خاصة بها، منها 423 (الدرس مقفل) و429 (تجاوز الحدّ). وإعادة المحاولة التلقائية بعد 429 اختيارية.

## En français

`@tkawen/os-sdk` est un client typé, sans dépendance, pour l'API `/api/v1` des académies TKAWEN OS. Il fonctionne sous Node 18+ et dans le navigateur. Ses types sont générés depuis la spécification OpenAPI vérifiée (46 opérations). On crée le client avec `createClient({ academy: 'demo' })`. Le jeton n'est envoyé dans l'en-tête `Authorization` que s'il est fourni. La version 0.2.0 ajoute `createToken` (jeton à capacités et à expiration), `getMe`, `revokeToken`, `withToken` et l'en-tête `Idempotency-Key` sur la commande et le paiement. Ces fonctions sont décrites dans la spécification mais pas encore déployées sur le serveur. D'ici là, le jeton vient de la route historique `/api/auth/login`. Les erreurs sont typées (401, 403, 404, 422, 423 leçon verrouillée, 429). Une nouvelle tentative automatique après un 429 est disponible en option.

## License

MIT © TKAWEN
