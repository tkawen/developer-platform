import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  createClient,
  GROUPS,
  TkawenApiError,
  TkawenForbiddenError,
  TkawenLessonLockedError,
  TkawenNotFoundError,
  TkawenRateLimitError,
  TkawenUnauthorizedError,
  TkawenValidationError,
  isTkawenApiError,
  type Course,
} from '../src/index.js';
import { mockFetch } from './helpers.js';
import { readFileSync } from 'node:fs';

const TOKEN = '1|test-token-not-a-secret';
const fail = (): never => {
  throw new Error('expected a rejection');
};

describe('URL building and headers', () => {
  it('defaults baseUrl to https://{academy}.tkawen.com/api/v1', () => {
    const { fetch } = mockFetch();
    expect(createClient({ academy: 'demo', fetch }).baseUrl).toBe('https://demo.tkawen.com/api/v1');
  });

  it('rejects an academy that is not a subdomain label (host injection)', () => {
    for (const bad of ['', 'evil.com/x', 'a@b', 'demo.evil', '-x']) {
      expect(() => createClient({ academy: bad })).toThrow(TypeError);
    }
  });

  it('accepts an https baseUrl override, strips trailing slash, refuses plain http off localhost', () => {
    const { fetch } = mockFetch();
    expect(createClient({ academy: 'x', baseUrl: 'https://staging.example.org/api/v1/', fetch }).baseUrl).toBe(
      'https://staging.example.org/api/v1',
    );
    expect(createClient({ academy: 'x', baseUrl: 'http://localhost:8000/api/v1', fetch }).baseUrl).toBe(
      'http://localhost:8000/api/v1',
    );
    expect(() => createClient({ academy: 'x', baseUrl: 'http://example.org/api/v1', fetch })).toThrow(/https/);
  });

  it('encodes path params and drops undefined query params', async () => {
    const { fetch, calls } = mockFetch({ body: { data: [], links: {}, meta: {} } });
    const tk = createClient({ academy: 'demo', fetch });
    await tk.catalogue.listCourses({ q: 'بايثون', level: 'beginner', page: 2, category: undefined });
    expect(calls[0]!.url).toBe(
      'https://demo.tkawen.com/api/v1/courses?q=%D8%A8%D8%A7%D9%8A%D8%AB%D9%88%D9%86&level=beginner&page=2',
    );
    await tk.getCourse('a/b c');
    expect(calls[1]!.url).toBe('https://demo.tkawen.com/api/v1/courses/a%2Fb%20c');
  });

  it('sends Accept and Accept-Language; no Authorization without a token', async () => {
    const { fetch, calls } = mockFetch({ body: {} });
    await createClient({ academy: 'demo', fetch, locale: 'fr' }).getCatalogueFacets();
    expect(calls[0]!.headers['accept']).toBe('application/json');
    expect(calls[0]!.headers['accept-language']).toBe('fr');
    expect(calls[0]!.headers['authorization']).toBeUndefined();
  });

  it('sends Authorization: Bearer when a token is set, and never exposes it on the client', async () => {
    const { fetch, calls } = mockFetch({ body: {} });
    const tk = createClient({ academy: 'demo', fetch, token: TOKEN });
    await tk.me.getMyDashboard();
    expect(calls[0]!.headers['authorization']).toBe(`Bearer ${TOKEN}`);
    expect(tk.authenticated).toBe(true);
    expect(JSON.stringify(tk)).not.toContain('test-token');
  });

  it('per-call and client headers cannot override Authorization', async () => {
    const { fetch, calls } = mockFetch({ body: {} });
    const tk = createClient({ academy: 'demo', fetch, token: TOKEN, headers: { Authorization: 'Bearer other' } });
    await tk.getMyDashboard({ headers: { authorization: 'Bearer spoof', 'X-Trace': '1' } });
    expect(calls[0]!.headers['authorization']).toBe(`Bearer ${TOKEN}`);
    expect(calls[0]!.headers['x-trace']).toBe('1');
  });

  it('exposes every one of the 46 spec operations, grouped and flat', () => {
    const spec = readFileSync(new URL('../../../openapi/tkawen-os-v1.yaml', import.meta.url), 'utf8');
    const ids = [...spec.matchAll(/operationId:\s*(\w+)/g)].map((m) => m[1]!);
    expect(ids).toHaveLength(46);
    const tk = createClient({ academy: 'demo', fetch: mockFetch().fetch }) as unknown as Record<string, unknown>;
    const grouped = GROUPS.flatMap((g) => Object.keys(tk[g] as object));
    expect(grouped.sort()).toEqual([...ids].sort());
    for (const id of ids) expect(typeof tk[id]).toBe('function');
  });
});

describe('representative operations', () => {
  it('listCourses returns the paginated body typed from the spec', async () => {
    const { fetch } = mockFetch({ body: { data: [{ slug: 'py' }], links: {}, meta: { total: 1 } } });
    const res = await createClient({ academy: 'demo', fetch }).listCourses();
    expectTypeOf(res.data).toEqualTypeOf<Course[]>();
    expect(res.data[0]!.slug).toBe('py');
  });

  it('addCartItem posts JSON and forwards the guest cart key', async () => {
    const { fetch, calls } = mockFetch({ status: 201, body: { data: { items: [] } } });
    await createClient({ academy: 'demo', fetch }).commerce.addCartItem({ slug: 'py', quantity: 1 }, { cartKey: 'k1' });
    expect(calls[0]!.init.method).toBe('POST');
    expect(calls[0]!.headers['content-type']).toBe('application/json');
    expect(calls[0]!.headers['x-cart-key']).toBe('k1');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ slug: 'py', quantity: 1 });
  });

  it('getCart omits X-Cart-Key when none is given', async () => {
    const { fetch, calls } = mockFetch({ body: { data: {} } });
    await createClient({ academy: 'demo', fetch }).getCart();
    expect(calls[0]!.headers['x-cart-key']).toBeUndefined();
  });

  it('verifyCertificate resolves a 404 verdict instead of throwing', async () => {
    const { fetch, calls } = mockFetch({ status: 404, body: { status: 'not_found' } });
    const res = await createClient({ academy: 'demo', fetch }).certificates.verifyCertificate(' ABC-123 ');
    expect(res.status).toBe('not_found');
    expect(calls[0]!.url).toBe('https://demo.tkawen.com/api/v1/verify/ABC-123');
  });

  it('removeFromMyWishlist uses DELETE with both path params', async () => {
    const { fetch, calls } = mockFetch({ body: { data: { saved: false } } });
    const res = await createClient({ academy: 'demo', fetch, token: TOKEN }).wishlist.removeFromMyWishlist('course', 'py');
    expect(calls[0]!.init.method).toBe('DELETE');
    expect(calls[0]!.url).toBe('https://demo.tkawen.com/api/v1/me/wishlist/course/py');
    expect(res.data.saved).toBe(false);
  });

  it('submitLessonAssignment sends multipart when a file is given', async () => {
    const { fetch, calls } = mockFetch({ status: 201, body: { data: {}, submission_id: 7 } });
    const res = await createClient({ academy: 'demo', fetch, token: TOKEN }).submitLessonAssignment('l1', {
      content: 'hi',
      file: new Blob(['x']),
      fileName: 'a.txt',
    });
    expect(calls[0]!.init.body).toBeInstanceOf(FormData);
    expect(calls[0]!.headers['content-type']).toBeUndefined();
    expect(res.submission_id).toBe(7);
  });

  it('getInstitutionMetrics sends query params', async () => {
    const { fetch, calls } = mockFetch({ body: {} });
    await createClient({ academy: 'demo', fetch, token: TOKEN }).staff.getInstitutionMetrics({ from: '2026-09-01', to: '2026-09-30' });
    expect(calls[0]!.url).toBe('https://demo.tkawen.com/api/v1/dashboard/metrics?from=2026-09-01&to=2026-09-30');
  });

  it('downloadAssignmentSubmissionFile returns a Blob and filename', async () => {
    const { fetch } = mockFetch(
      new Response('PDFDATA', {
        status: 200,
        headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="work.pdf"' },
      }),
    );
    const f = await createClient({ academy: 'demo', fetch, token: TOKEN }).downloadAssignmentSubmissionFile(12);
    expect(f.filename).toBe('work.pdf');
    expect(f.contentType).toBe('application/pdf');
    expect(await f.data.text()).toBe('PDFDATA');
  });
});

describe('typed errors', () => {
  const run = async (status: number, body: unknown, headers?: Record<string, string>) => {
    const { fetch } = mockFetch({ status, body, ...(headers ? { headers } : {}) });
    return createClient({ academy: 'demo', fetch, token: TOKEN })
      .getLesson('l1')
      .then(() => {
        throw new Error('expected a rejection');
      })
      .catch((e: unknown) => e as TkawenApiError);
  };

  it('401 → TkawenUnauthorizedError', async () => {
    const e = await run(401, { message: 'Unauthenticated.' });
    expect(e).toBeInstanceOf(TkawenUnauthorizedError);
    expect(e).toBeInstanceOf(TkawenApiError);
    expect(e.kind).toBe('unauthorized');
    expect(e.status).toBe(401);
    expect(e.message).toBe('Unauthenticated.');
    expect(e.operationId).toBe('getLesson');
    expect(e.url).not.toContain('test-token');
    expect(e.message).not.toContain('test-token');
  });

  it('403 → TkawenForbiddenError', async () => {
    const e = await run(403, { message: 'This action is unauthorized.' });
    expect(e).toBeInstanceOf(TkawenForbiddenError);
    expect(e.kind).toBe('forbidden');
  });

  it('404 → TkawenNotFoundError', async () => {
    const e = await run(404, { message: 'Not found.' });
    expect(e).toBeInstanceOf(TkawenNotFoundError);
    expect(isTkawenApiError(e)).toBe(true);
  });

  it('422 → TkawenValidationError with the errors map', async () => {
    const e = (await run(422, { message: 'The rating field is required.', errors: { rating: ['required'] } })) as TkawenValidationError;
    expect(e).toBeInstanceOf(TkawenValidationError);
    expect(e.errors).toEqual({ rating: ['required'] });
  });

  it('422 with the {error} envelope → empty errors map, message from error', async () => {
    const e = (await run(422, { error: 'الدورة المذكورة غير موجودة.' })) as TkawenValidationError;
    expect(e.errors).toEqual({});
    expect(e.message).toBe('الدورة المذكورة غير موجودة.');
  });

  it('423 → TkawenLessonLockedError with needs / needsSlug', async () => {
    const e = (await run(423, {
      message: 'أكمل الدرس السابق',
      error: 'lesson_locked',
      needs: 'Intro',
      needs_slug: 'intro',
    })) as TkawenLessonLockedError;
    expect(e).toBeInstanceOf(TkawenLessonLockedError);
    expect(e.kind).toBe('lesson_locked');
    expect(e.needs).toBe('Intro');
    expect(e.needsSlug).toBe('intro');
  });

  it('429 → TkawenRateLimitError, retryAfter from body, else from Retry-After', async () => {
    const a = (await run(429, { message: 'wait', retry_after: 42 })) as TkawenRateLimitError;
    expect(a).toBeInstanceOf(TkawenRateLimitError);
    expect(a.retryAfter).toBe(42);
    const b = (await run(429, { message: 'wait' }, { 'Retry-After': '7' })) as TkawenRateLimitError;
    expect(b.retryAfter).toBe(7);
  });

  it('other statuses → base TkawenApiError (e.g. 402 on settleFreeOrder)', async () => {
    const { fetch } = mockFetch({ status: 402, body: { error: 'pay first', requires_payment: true, total_minor: 500 } });
    const e = await createClient({ academy: 'demo', fetch, token: TOKEN })
      .settleFreeOrder('ORD-1')
      .then(fail, (x: unknown) => x as TkawenApiError);
    expect(e.constructor).toBe(TkawenApiError);
    expect(e.status).toBe(402);
    expect(e.message).toBe('pay first');
    expect((e.body as { total_minor: number }).total_minor).toBe(500);
  });

  it('non-JSON error bodies are kept as text', async () => {
    const { fetch } = mockFetch(new Response('<html>502</html>', { status: 502, headers: { 'content-type': 'text/html' } }));
    const e = await createClient({ academy: 'demo', fetch }).listInstructors().then(fail, (x: unknown) => x as TkawenApiError);
    expect(e.status).toBe(502);
    expect(e.body).toBe('<html>502</html>');
  });
});

describe('429 retry (opt-in)', () => {
  afterEach(() => vi.useRealTimers());

  it('does not retry by default', async () => {
    const { fetch } = mockFetch({ status: 429, body: { message: 'wait', retry_after: 1 } }, { body: {} });
    await expect(createClient({ academy: 'demo', fetch }).getCatalogueFacets()).rejects.toBeInstanceOf(TkawenRateLimitError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries once after retry_after seconds when enabled', async () => {
    vi.useFakeTimers();
    const { fetch } = mockFetch({ status: 429, body: { message: 'wait', retry_after: 3 } }, { body: { total: 5 } });
    const p = createClient({ academy: 'demo', fetch, retry: { on429: true } }).getCatalogueFacets();
    await vi.advanceTimersByTimeAsync(2999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const res = await p;
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(res.total).toBe(5);
  });

  it('retries only once: a second 429 is thrown', async () => {
    vi.useFakeTimers();
    const { fetch } = mockFetch({ status: 429, body: { message: 'wait', retry_after: 1 } });
    const p = createClient({ academy: 'demo', fetch, retry: { on429: true } }).getCatalogueFacets();
    const assertion = expect(p).rejects.toBeInstanceOf(TkawenRateLimitError);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not wait longer than maxWaitSeconds', async () => {
    const { fetch } = mockFetch({ status: 429, body: { message: 'wait', retry_after: 600 } }, { body: {} });
    const e = await createClient({ academy: 'demo', fetch, retry: { on429: true, maxWaitSeconds: 60 } })
      .getCatalogueFacets()
      .then(fail, (x: unknown) => x as TkawenRateLimitError);
    expect(e.retryAfter).toBe(600);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
