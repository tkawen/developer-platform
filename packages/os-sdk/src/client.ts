import { HttpCore } from './http.js';
import type {
  BodyOf,
  CartRequestOptions,
  ClientOptions,
  DownloadedFile,
  QueryOf,
  RequestOptions,
  ResponseBody,
  SuccessBody,
  WishlistType,
} from './types.js';

/**
 * One method per operationId of `openapi/tkawen-os-v1.yaml` (43 operations), grouped by the spec's tags.
 * Method names are the operationIds. Auth: "public" needs no token; "optional" reads the token when present;
 * "token" requires `token`; "staff" requires a staff token.
 */
function buildOperations(http: HttpCore) {
  const cartHeaders = (o?: CartRequestOptions) => ({ 'X-Cart-Key': o?.cartKey });

  const catalogue = {
    /** List published courses (paginated, filterable, Arabic-aware search). Auth: public. */
    listCourses: (query?: QueryOf<'listCourses'>, options?: RequestOptions) =>
      http.call<SuccessBody<'listCourses'>>({ operationId: 'listCourses', method: 'GET', path: '/courses', query, options }),

    /** One published course with its modules, lessons, prerequisites and rating. Auth: public (token used for prerequisite `done`). */
    getCourse: (slug: string, options?: RequestOptions) =>
      http.call<SuccessBody<'getCourse'>>({ operationId: 'getCourse', method: 'GET', path: '/courses/{slug}', pathParams: { slug }, options }),

    /** Up to three other published courses, same category first, then newest. Auth: public. */
    listRelatedCourses: (slug: string, options?: RequestOptions) =>
      http.call<SuccessBody<'listRelatedCourses'>>({
        operationId: 'listRelatedCourses', method: 'GET', path: '/courses/{slug}/related', pathParams: { slug }, options,
      }),

    /** Approved reviews of a published course, with average and distribution. Auth: public. */
    listCourseReviews: (slug: string, query?: QueryOf<'listCourseReviews'>, options?: RequestOptions) =>
      http.call<SuccessBody<'listCourseReviews'>>({
        operationId: 'listCourseReviews', method: 'GET', path: '/courses/{slug}/reviews', pathParams: { slug }, query, options,
      }),

    /** Create or replace the caller's review (goes back to pending approval). Auth: token. Limit: 6/min. */
    submitCourseReview: (slug: string, body: BodyOf<'submitCourseReview'>, options?: RequestOptions) =>
      http.call<SuccessBody<'submitCourseReview'>>({
        operationId: 'submitCourseReview', method: 'POST', path: '/courses/{slug}/reviews', pathParams: { slug }, body, options,
      }),

    /** Whether the caller may review this course, and their existing review. Auth: token. */
    getMyCourseReview: (slug: string, options?: RequestOptions) =>
      http.call<SuccessBody<'getMyCourseReview'>>({
        operationId: 'getMyCourseReview', method: 'GET', path: '/courses/{slug}/reviews/mine', pathParams: { slug }, options,
      }),

    /** Faculty directory: instructors/admins teaching at least one published course. Not paginated. Auth: public. */
    listInstructors: (options?: RequestOptions) =>
      http.call<SuccessBody<'listInstructors'>>({ operationId: 'listInstructors', method: 'GET', path: '/instructors', options }),

    /** Public instructor profile and their published courses (not wrapped in `data`). Auth: public. */
    getInstructor: (publicId: string, options?: RequestOptions) =>
      http.call<SuccessBody<'getInstructor'>>({
        operationId: 'getInstructor', method: 'GET', path: '/instructors/{publicId}', pathParams: { publicId }, options,
      }),

    /** Filter values with counts, derived from the published set. Auth: public. */
    getCatalogueFacets: (options?: RequestOptions) =>
      http.call<SuccessBody<'getCatalogueFacets'>>({ operationId: 'getCatalogueFacets', method: 'GET', path: '/catalogue/facets', options }),

    /** Data for the client's /sitemap.xml. Auth: public. */
    getSitemapFeed: (options?: RequestOptions) =>
      http.call<SuccessBody<'getSitemapFeed'>>({ operationId: 'getSitemapFeed', method: 'GET', path: '/sitemap', options }),
  };

  const auth = {
    /**
     * Sign-in methods actually wired on this academy. Auth: public.
     * @remarks /api/v1 does not issue tokens; they come from the legacy unversioned `POST /api/auth/login`.
     */
    listAuthProviders: (options?: RequestOptions) =>
      http.call<SuccessBody<'listAuthProviders'>>({ operationId: 'listAuthProviders', method: 'GET', path: '/auth/providers', options }),
  };

  const learning = {
    /** Lock state and completion of every lesson for the caller's own enrolment (404 without one). Auth: token. */
    getCourseLocks: (slug: string, options?: RequestOptions) =>
      http.call<SuccessBody<'getCourseLocks'>>({
        operationId: 'getCourseLocks', method: 'GET', path: '/courses/{slug}/locks', pathParams: { slug }, options,
      }),

    /** The lesson room payload (content, signed media URLs valid 300 s, progress). May throw 423 lesson_locked. Auth: optional. */
    getLesson: (slug: string, options?: RequestOptions) =>
      http.call<SuccessBody<'getLesson'>>({ operationId: 'getLesson', method: 'GET', path: '/lessons/{slug}', pathParams: { slug }, options }),

    /** Caption cues of a lesson, with in-video search (`q`). May throw 423. Auth: optional. */
    getLessonCaptions: (slug: string, query?: QueryOf<'getLessonCaptions'>, options?: RequestOptions) =>
      http.call<SuccessBody<'getLessonCaptions'>>({
        operationId: 'getLessonCaptions', method: 'GET', path: '/lessons/{slug}/captions', pathParams: { slug }, query, options,
      }),

    /** The 30-second watch ping: accumulates watch time, stores position, may complete the lesson. Auth: token. */
    recordLessonProgress: (slug: string, body: BodyOf<'recordLessonProgress'>, options?: RequestOptions) =>
      http.call<SuccessBody<'recordLessonProgress'>>({
        operationId: 'recordLessonProgress', method: 'POST', path: '/lessons/{slug}/progress', pathParams: { slug }, body, options,
      }),

    /** Question threads under a lesson (enrolled learners and course staff). Auth: token. */
    listLessonDiscussion: (slug: string, options?: RequestOptions) =>
      http.call<SuccessBody<'listLessonDiscussion'>>({
        operationId: 'listLessonDiscussion', method: 'GET', path: '/lessons/{slug}/discussion', pathParams: { slug }, options,
      }),

    /** Ask a question, or reply to a top-level thread. Auth: token. Limit: 30/min. */
    postLessonDiscussion: (slug: string, body: BodyOf<'postLessonDiscussion'>, options?: RequestOptions) =>
      http.call<SuccessBody<'postLessonDiscussion'>>({
        operationId: 'postLessonDiscussion', method: 'POST', path: '/lessons/{slug}/discussion', pathParams: { slug }, body, options,
      }),

    /**
     * Hand in an assignment (text and/or file ≤ 20 MB). With `file` the body is sent as multipart/form-data,
     * otherwise as JSON. Auth: token. Limit: 20/min.
     */
    submitLessonAssignment: (
      slug: string,
      body: { content?: string | null; file?: Blob; fileName?: string },
      options?: RequestOptions,
    ) => {
      let payload: unknown;
      if (body.file !== undefined) {
        const fd = new FormData();
        if (body.content != null) fd.append('content', body.content);
        fd.append('file', body.file, body.fileName ?? 'upload');
        payload = fd;
      } else {
        payload = { content: body.content ?? null };
      }
      return http.call<SuccessBody<'submitLessonAssignment'>>({
        operationId: 'submitLessonAssignment', method: 'POST', path: '/lessons/{slug}/assignment', pathParams: { slug }, body: payload, options,
      });
    },

    /** Download a submission's file (owner, tenant admin, or the course's instructor). Auth: token. */
    downloadAssignmentSubmissionFile: async (submission: number, options?: RequestOptions): Promise<DownloadedFile> => {
      const res = await http.call<Response>({
        operationId: 'downloadAssignmentSubmissionFile',
        method: 'GET',
        path: '/assignment-submissions/{submission}/file',
        pathParams: { submission },
        raw: true,
        options: { ...options, headers: { Accept: 'application/octet-stream, */*', ...options?.headers } },
      });
      const cd = res.headers.get('content-disposition') ?? '';
      const m = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(cd);
      const raw = m ? (m[1] ?? m[2] ?? null) : null;
      let filename: string | null = raw;
      if (m?.[1]) {
        try {
          filename = decodeURIComponent(m[1]);
        } catch {
          filename = m[1];
        }
      }
      return { data: await res.blob(), contentType: res.headers.get('content-type'), filename };
    },

    /** Weighted gradebook for the caller's enrolment in a course. Auth: token. */
    getMyTranscript: (slug: string, options?: RequestOptions) =>
      http.call<SuccessBody<'getMyTranscript'>>({
        operationId: 'getMyTranscript', method: 'GET', path: '/me/transcript/{slug}', pathParams: { slug }, options,
      }),
  };

  const commerce = {
    /** Payment methods this academy accepts (Chargily flag, CCP transfer details). Auth: public. */
    listPaymentMethods: (options?: RequestOptions) =>
      http.call<SuccessBody<'listPaymentMethods'>>({ operationId: 'listPaymentMethods', method: 'GET', path: '/payment-methods', options }),

    /** Read the caller's (or guest's, via `cartKey`) open cart. Never creates one. Auth: optional. */
    getCart: (options?: CartRequestOptions) =>
      http.call<SuccessBody<'getCart'>>({ operationId: 'getCart', method: 'GET', path: '/cart', headers: cartHeaders(options), options }),

    /**
     * Add a published course to the cart (price read server-side). Auth: optional.
     * @remarks The server may answer 200 or 201 for the same call; both resolve normally.
     */
    addCartItem: (body: BodyOf<'addCartItem'>, options?: CartRequestOptions) =>
      http.call<SuccessBody<'addCartItem'>>({
        operationId: 'addCartItem', method: 'POST', path: '/cart/items', body, headers: cartHeaders(options), options,
      }),

    /** Remove a course line from the cart (unknown slug is a no-op). Auth: optional. */
    removeCartItem: (slug: string, options?: CartRequestOptions) =>
      http.call<SuccessBody<'removeCartItem'>>({
        operationId: 'removeCartItem', method: 'DELETE', path: '/cart/items/{slug}', pathParams: { slug }, headers: cartHeaders(options), options,
      }),

    /**
     * Turn the open cart into a pending order (prices and coupon recomputed server-side). Auth: token.
     * Not idempotent: retrying creates a second pending order.
     * @remarks known server defect, fix pending deployment: without an open cart and without
     * `X-Cart-Key` the server may answer 500 instead of 404. Pass `cartKey` to avoid it.
     */
    createCheckoutOrder: (body?: BodyOf<'createCheckoutOrder'>, options?: CartRequestOptions) =>
      http.call<SuccessBody<'createCheckoutOrder'>>({
        operationId: 'createCheckoutOrder', method: 'POST', path: '/checkout', body: body ?? {}, headers: cartHeaders(options), options,
      }),

    /** Settle the caller's own zero-total order. Priced orders throw a `TkawenApiError` with status 402. Auth: token. */
    settleFreeOrder: (number: string, options?: RequestOptions) =>
      http.call<SuccessBody<'settleFreeOrder'>>({
        operationId: 'settleFreeOrder', method: 'POST', path: '/orders/{number}/pay', pathParams: { number }, options,
      }),

    /** The caller's payments with a derived stage (latest 200, not paginated). Auth: token. */
    listMyPayments: (options?: RequestOptions) =>
      http.call<SuccessBody<'listMyPayments'>>({ operationId: 'listMyPayments', method: 'GET', path: '/me/payments', options }),
  };

  const me = {
    /** The caller's enrolments with course and certificate. Auth: token. */
    listMyEnrollments: (options?: RequestOptions) =>
      http.call<SuccessBody<'listMyEnrollments'>>({ operationId: 'listMyEnrollments', method: 'GET', path: '/me/enrollments', options }),

    /** The caller's enrolments by public id (compact rows). Auth: token. */
    listMyEnrollmentsByPublicId: (options?: RequestOptions) =>
      http.call<SuccessBody<'listMyEnrollmentsByPublicId'>>({
        operationId: 'listMyEnrollmentsByPublicId', method: 'GET', path: '/me/enrollments/list', options,
      }),

    /**
     * One enrolment (`ENR-YYYY-XXXXXX`) with its step timeline and status events. Auth: token.
     * @remarks known server defect, fix pending deployment: for some paid enrolments the server may
     * answer 500.
     */
    getMyEnrollmentTimeline: (publicId: string, options?: RequestOptions) =>
      http.call<SuccessBody<'getMyEnrollmentTimeline'>>({
        operationId: 'getMyEnrollmentTimeline', method: 'GET', path: '/me/enrollments/{publicId}', pathParams: { publicId }, options,
      }),

    /** Student portal home: continue, pending, earned, next (not wrapped in `data`). Auth: token. */
    getMyDashboard: (options?: RequestOptions) =>
      http.call<SuccessBody<'getMyDashboard'>>({ operationId: 'getMyDashboard', method: 'GET', path: '/me/dashboard', options }),

    /** The caller's courses with display state, resume point, assessment and certificate. Auth: token. */
    listMyCourses: (options?: RequestOptions) =>
      http.call<SuccessBody<'listMyCourses'>>({ operationId: 'listMyCourses', method: 'GET', path: '/me/courses', options }),
  };

  const requests = {
    /** The caller's requests, with counts and the type/status dictionaries. Auth: token. */
    listMyRequests: (options?: RequestOptions) =>
      http.call<SuccessBody<'listMyRequests'>>({ operationId: 'listMyRequests', method: 'GET', path: '/me/requests', options }),

    /** File a request to the academy. Auth: token. Limit: 10 per 10 min. */
    createMyRequest: (body: BodyOf<'createMyRequest'>, options?: RequestOptions) =>
      http.call<SuccessBody<'createMyRequest'>>({ operationId: 'createMyRequest', method: 'POST', path: '/me/requests', body, options }),

    /** One request with its timeline and thread. Side effect: marks staff replies read. Auth: token. */
    getMyRequest: (publicId: string, options?: RequestOptions) =>
      http.call<SuccessBody<'getMyRequest'>>({
        operationId: 'getMyRequest', method: 'GET', path: '/me/requests/{publicId}', pathParams: { publicId }, options,
      }),

    /** Reply in an open request's thread (409 when closed). Auth: token. Limit: 30 per 10 min. */
    postMyRequestMessage: (publicId: string, body: BodyOf<'postMyRequestMessage'>, options?: RequestOptions) =>
      http.call<SuccessBody<'postMyRequestMessage'>>({
        operationId: 'postMyRequestMessage', method: 'POST', path: '/me/requests/{publicId}/messages', pathParams: { publicId }, body, options,
      }),

    /** Withdraw a request (only while submitted, under_review or info_required). Auth: token. */
    cancelMyRequest: (publicId: string, options?: RequestOptions) =>
      http.call<SuccessBody<'cancelMyRequest'>>({
        operationId: 'cancelMyRequest', method: 'POST', path: '/me/requests/{publicId}/cancel', pathParams: { publicId }, options,
      }),
  };

  const wishlist = {
    /** Saved courses, instructors and bundles. Auth: token. */
    listMyWishlist: (options?: RequestOptions) =>
      http.call<SuccessBody<'listMyWishlist'>>({ operationId: 'listMyWishlist', method: 'GET', path: '/me/wishlist', options }),

    /** Save a course (slug), instructor (public_id) or bundle (slug). Idempotent: 201 new, 200 existing. Auth: token. */
    addToMyWishlist: (body: BodyOf<'addToMyWishlist'>, options?: RequestOptions) =>
      http.call<SuccessBody<'addToMyWishlist'>>({ operationId: 'addToMyWishlist', method: 'POST', path: '/me/wishlist', body, options }),

    /** Is this subject in the caller's wishlist. Auth: token. */
    checkMyWishlist: (type: string, key: string, options?: RequestOptions) =>
      http.call<SuccessBody<'checkMyWishlist'>>({
        operationId: 'checkMyWishlist', method: 'GET', path: '/me/wishlist/check/{type}/{key}', pathParams: { type, key }, options,
      }),

    /** Remove a saved subject (absent item answers saved=false). Auth: token. */
    removeFromMyWishlist: (type: WishlistType, key: string, options?: RequestOptions) =>
      http.call<SuccessBody<'removeFromMyWishlist'>>({
        operationId: 'removeFromMyWishlist', method: 'DELETE', path: '/me/wishlist/{type}/{key}', pathParams: { type, key }, options,
      }),
  };

  const staff = {
    /**
     * Pre-aggregated enrolment metrics for a date range. Auth: academy staff.
     */
    getInstitutionMetrics: (query?: QueryOf<'getInstitutionMetrics'>, options?: RequestOptions) =>
      http.call<SuccessBody<'getInstitutionMetrics'>>({
        operationId: 'getInstitutionMetrics', method: 'GET', path: '/dashboard/metrics', query, options,
      }),
  };

  const certificates = {
    /**
     * Verify a certificate by certificate code or credential UID. Every attempt is logged. Auth: public.
     * Limit: 10/min and 300/day per IP. A 404 is a verdict here, so it resolves to `{status: "not_found"}`
     * instead of throwing. A revoked or tampered certificate is a 200 with that `status`.
     */
    verifyCertificate: (code: string, options?: RequestOptions) =>
      http.call<SuccessBody<'verifyCertificate'> | ResponseBody<'verifyCertificate', 404>>({
        operationId: 'verifyCertificate', method: 'GET', path: '/verify/{code}', pathParams: { code: code.trim() }, acceptStatuses: [404], options,
      }),
  };

  return { catalogue, auth, learning, commerce, me, requests, wishlist, staff, certificates };
}

type Groups = ReturnType<typeof buildOperations>;
type Flat = Groups['catalogue'] &
  Groups['auth'] &
  Groups['learning'] &
  Groups['commerce'] &
  Groups['me'] &
  Groups['requests'] &
  Groups['wishlist'] &
  Groups['staff'] &
  Groups['certificates'];

/** The client: grouped methods (`client.catalogue.listCourses`) and the same methods flat (`client.listCourses`). */
export type TkawenClient = Groups &
  Flat & {
    /** The resolved API root, e.g. `https://demo.tkawen.com/api/v1`. */
    readonly baseUrl: string;
    /** Whether a token was configured (the token itself is never exposed). */
    readonly authenticated: boolean;
  };

export const GROUPS = ['catalogue', 'auth', 'learning', 'commerce', 'me', 'requests', 'wishlist', 'staff', 'certificates'] as const;

/**
 * Create a client for one academy.
 *
 * ```ts
 * const tk = createClient({ academy: 'demo', locale: 'ar' });
 * const { data } = await tk.catalogue.listCourses({ per_page: 12 });
 * ```
 */
export function createClient(options: ClientOptions): TkawenClient {
  const http = new HttpCore(options);
  const groups = buildOperations(http);
  const flat = Object.assign({}, ...GROUPS.map((g) => groups[g])) as Flat;
  const client = { ...flat, ...groups } as Groups & Flat;
  Object.defineProperty(client, 'baseUrl', { value: http.baseUrl, enumerable: true });
  Object.defineProperty(client, 'authenticated', { get: () => http.authenticated, enumerable: true });
  return client as TkawenClient;
}
