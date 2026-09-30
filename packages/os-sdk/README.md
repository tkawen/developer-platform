# @tkawen/os-sdk

Typed client for the API of a TKAWEN OS academy (`https://{academy}.tkawen.com/api/v1`).

- It has **zero runtime dependencies** and runs on Node 18+ and in browsers. It uses the global `fetch`, and you can inject your own.
- It ships ESM and CommonJS builds with TypeScript declarations.
- Every type is **generated from the verified OpenAPI spec** [`openapi/tkawen-os-v1.yaml`](../../openapi/tkawen-os-v1.yaml) with `openapi-typescript`. The spec has 43 operations and the SDK exposes 43 methods. Each method is named after its `operationId`.

> **Status: 0.1.0, not published yet.** `npm install @tkawen/os-sdk` works only after the first publish.

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

With a token:

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

Every method also accepts per-call options `{ signal, headers }` as its last argument. The cart and checkout methods also accept `cartKey`, which is sent as `X-Cart-Key`.

## Methods (grouped by spec tag, also available flat on the client)

| group | methods |
|---|---|
| `catalogue` | listCourses, getCourse, listRelatedCourses, listCourseReviews, submitCourseReview, getMyCourseReview, listInstructors, getInstructor, getCatalogueFacets, getSitemapFeed |
| `auth` | listAuthProviders |
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

Useful type helpers are exported: `SuccessBody<'getCourse'>`, `QueryOf<'listCourses'>`, `BodyOf<'createMyRequest'>`, the schema aliases (`Course`, `Cart`, `Order`…), and the raw `paths`, `operations` and `components`.

## Errors

Every non-2xx response throws a `TkawenApiError` with `status`, `body` (the parsed server body), `method`, `url`, `operationId` and a `kind` discriminant:

| status | class | extra |
|---|---|---|
| 401 | `TkawenUnauthorizedError` | |
| 403 | `TkawenForbiddenError` | |
| 404 | `TkawenNotFoundError` | |
| 422 | `TkawenValidationError` | `errors: Record<string, string[]>`, which is empty for `{error}` refusals |
| 423 | `TkawenLessonLockedError` | `needs`, `needsSlug` |
| 429 | `TkawenRateLimitError` | `retryAfter` (seconds) |
| others (402, 409, 5xx…) | `TkawenApiError` | |

The message comes from `message`, then `error`, then `status` in the body. Messages are often Arabic, because the server writes them that way.

## Authentication: what this SDK does not do

**/api/v1 does not issue tokens.** Login, registration and logout exist only on the legacy unversioned routes of the tenant host (for example `POST /api/auth/login`), which are outside this spec. This SDK therefore **accepts** a token and does not implement a login. Tokens are Sanctum personal access tokens. They have no expiry and no scopes, so store them like passwords.

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

حزمة `@tkawen/os-sdk` عميل مُنمَّط (TypeScript) لواجهة `/api/v1` في أكاديميات TKAWEN OS. لا تعتمد على أي حزمة أخرى، وتعمل في Node 18+ وفي المتصفح. أنواعها كلّها مولَّدة من ملف OpenAPI الموثَّق، وفيه 43 عملية. أنشئ العميل بـ`createClient({ academy: 'demo' })`. ويُرسَل الرمز (token) في ترويسة `Authorization` فقط إذا مرّرته. لا تُصدر الواجهة `/api/v1` رموز الدخول، فالرمز يأتي من المسار القديم `/api/auth/login`. تحمل الأخطاء أصنافًا خاصة بها، منها 423 (الدرس مقفل) و429 (تجاوز الحدّ). وإعادة المحاولة التلقائية بعد 429 اختيارية.

## En français

`@tkawen/os-sdk` est un client typé, sans dépendance, pour l'API `/api/v1` des académies TKAWEN OS. Il fonctionne sous Node 18+ et dans le navigateur. Ses types sont générés depuis la spécification OpenAPI vérifiée (43 opérations). On crée le client avec `createClient({ academy: 'demo' })`. Le jeton n'est envoyé dans l'en-tête `Authorization` que s'il est fourni. `/api/v1` n'émet pas de jeton : la connexion passe par la route historique `/api/auth/login`. Les erreurs sont typées (401, 403, 404, 422, 423 leçon verrouillée, 429). Une nouvelle tentative automatique après un 429 est disponible en option.

## License

MIT © TKAWEN
