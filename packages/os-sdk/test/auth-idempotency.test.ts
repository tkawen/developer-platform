import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  createClient,
  getResponseMeta,
  REQUIRED_ABILITY,
  TkawenApiError,
  TkawenForbiddenError,
  TkawenIdempotencyError,
  TkawenInsufficientAbilityError,
  TkawenValidationError,
  type InstitutionMetrics,
  type IssuedToken,
  type SuccessBody,
} from '../src/index.js';
import { mockFetch } from './helpers.js';
import { readFileSync } from 'node:fs';

const TOKEN = '1|test-token-not-a-secret';
const NEW_TOKEN = '2|issued-token-not-a-secret';
const PASSWORD = 'correct horse battery staple';

const issued = {
  data: {
    token_type: 'Bearer',
    access_token: NEW_TOKEN,
    expires_at: '2026-10-31T00:00:00Z',
    abilities: ['read', 'learn'],
    user: { id: 'usr_1', name: 'A', email: 'a@example.com', email_verified: true, role: 'student' },
  },
};

const rejected = <T>(p: Promise<T>) =>
  p.then(
    () => {
      throw new Error('expected a rejection');
    },
    (e: unknown) => e as TkawenApiError,
  );

describe('tokens (issueToken / revokeToken / getAuthenticatedCaller)', () => {
  it('issueToken posts credentials once, returns the token, and does not switch the client', async () => {
    const { fetch, calls } = mockFetch({ status: 201, body: issued }, { body: { data: { continue: [] } } });
    const tk = createClient({ academy: 'demo', fetch });
    const res = await tk.auth.issueToken({ email: 'a@example.com', password: PASSWORD, abilities: ['read', 'learn'], device_name: 'cli' });
    expectTypeOf(res.data).toEqualTypeOf<IssuedToken>();
    expect(res.data.access_token).toBe(NEW_TOKEN);
    expect(res.data.expires_at).toBe('2026-10-31T00:00:00Z');
    expect(calls[0]!.init.method).toBe('POST');
    expect(calls[0]!.url).toBe('https://demo.tkawen.com/api/v1/auth/token');
    expect(calls[0]!.headers['authorization']).toBeUndefined();
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      email: 'a@example.com',
      password: PASSWORD,
      abilities: ['read', 'learn'],
      device_name: 'cli',
    });
    // Nothing about the password or the new token is kept on (or serialised from) the client.
    expect(tk.authenticated).toBe(false);
    expect(JSON.stringify(tk)).not.toContain(PASSWORD);
    expect(JSON.stringify(tk)).not.toContain('issued-token');
    await tk.getMyDashboard();
    expect(calls[1]!.headers['authorization']).toBeUndefined();
  });

  it('createToken and getMe are aliases of issueToken and getAuthenticatedCaller', () => {
    const tk = createClient({ academy: 'demo', fetch: mockFetch().fetch });
    expect(tk.createToken).toBe(tk.auth.issueToken);
    expect(tk.getMe).toBe(tk.auth.getAuthenticatedCaller);
    expect(Object.keys(tk)).not.toContain('createToken');
  });

  it('a wrong-credentials 422 carries the server body only, never the password', async () => {
    const { fetch } = mockFetch({ status: 422, body: { message: 'bad', errors: { email: ['بيانات الدخول غير صحيحة.'] } } });
    const e = (await rejected(createClient({ academy: 'demo', fetch }).createToken({ email: 'a@example.com', password: PASSWORD }))) as TkawenValidationError;
    expect(e).toBeInstanceOf(TkawenValidationError);
    expect(e.errors['email']).toEqual(['بيانات الدخول غير صحيحة.']);
    expect(JSON.stringify({ ...e, message: e.message })).not.toContain(PASSWORD);
    expect(e.url).not.toContain(PASSWORD);
  });

  it('withToken returns a new authenticated client; the original is unchanged', async () => {
    const { fetch, calls } = mockFetch({ body: { data: { user: issued.data.user, token: null } } });
    const tk = createClient({ academy: 'demo', fetch, locale: 'ar' });
    const me = tk.withToken(NEW_TOKEN);
    expect(me).not.toBe(tk);
    expect(me.authenticated).toBe(true);
    expect(tk.authenticated).toBe(false);
    await me.getMe();
    expect(calls[0]!.url).toBe('https://demo.tkawen.com/api/v1/auth/me');
    expect(calls[0]!.headers['authorization']).toBe(`Bearer ${NEW_TOKEN}`);
    expect(calls[0]!.headers['accept-language']).toBe('ar');
    expect(JSON.stringify(me)).not.toContain('issued-token');
  });

  it('setToken switches (and clears) the token of the same client', async () => {
    const { fetch, calls } = mockFetch({ body: {} });
    const tk = createClient({ academy: 'demo', fetch, token: TOKEN });
    tk.setToken(NEW_TOKEN);
    await tk.getMyDashboard();
    expect(calls[0]!.headers['authorization']).toBe(`Bearer ${NEW_TOKEN}`);
    tk.setToken(undefined);
    expect(tk.authenticated).toBe(false);
    await tk.listCourses();
    expect(calls[1]!.headers['authorization']).toBeUndefined();
  });

  it('revokeToken sends DELETE /auth/token and resolves with no value on 204', async () => {
    const { fetch, calls } = mockFetch(new Response(null, { status: 204 }));
    const out = await createClient({ academy: 'demo', fetch, token: TOKEN }).auth.revokeToken();
    expect(out).toBeUndefined();
    expect(calls[0]!.init.method).toBe('DELETE');
    expect(calls[0]!.url).toBe('https://demo.tkawen.com/api/v1/auth/token');
    expect(calls[0]!.headers['authorization']).toBe(`Bearer ${TOKEN}`);
  });
});

describe('Idempotency-Key', () => {
  afterEach(() => vi.unstubAllGlobals());
  const order = { data: { number: 'ORD-1' } };

  it('is not sent by default', async () => {
    const { fetch, calls } = mockFetch({ status: 201, body: order });
    await createClient({ academy: 'demo', fetch, token: TOKEN }).createCheckoutOrder();
    expect(calls[0]!.headers['idempotency-key']).toBeUndefined();
  });

  it('sends a per-call idempotencyKey on createCheckoutOrder and settleFreeOrder', async () => {
    const { fetch, calls } = mockFetch({ status: 201, body: order }, { body: order });
    const tk = createClient({ academy: 'demo', fetch, token: TOKEN });
    await tk.createCheckoutOrder({ coupon: 'X' }, { idempotencyKey: 'chk-1', cartKey: 'ck' });
    await tk.commerce.settleFreeOrder('ORD-1', { idempotencyKey: 'pay-1' });
    expect(calls[0]!.headers['idempotency-key']).toBe('chk-1');
    expect(calls[0]!.headers['x-cart-key']).toBe('ck');
    expect(calls[1]!.headers['idempotency-key']).toBe('pay-1');
    expect(calls[1]!.url).toBe('https://demo.tkawen.com/api/v1/orders/ORD-1/pay');
  });

  it("idempotency: 'auto' generates a fresh UUID per call, and a per-call key still wins", async () => {
    const { fetch, calls } = mockFetch({ status: 201, body: order });
    const tk = createClient({ academy: 'demo', fetch, token: TOKEN, idempotency: 'auto' });
    await tk.createCheckoutOrder();
    await tk.createCheckoutOrder();
    await tk.createCheckoutOrder({}, { idempotencyKey: 'mine' });
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    expect(calls[0]!.headers['idempotency-key']).toMatch(uuid);
    expect(calls[1]!.headers['idempotency-key']).toMatch(uuid);
    expect(calls[0]!.headers['idempotency-key']).not.toBe(calls[1]!.headers['idempotency-key']);
    expect(calls[2]!.headers['idempotency-key']).toBe('mine');
  });

  it("'auto' does not touch other operations", async () => {
    const { fetch, calls } = mockFetch({ status: 201, body: { data: {} } });
    await createClient({ academy: 'demo', fetch, idempotency: 'auto' }).addCartItem({ slug: 'py' });
    expect(calls[0]!.headers['idempotency-key']).toBeUndefined();
  });

  it('accepts a key generator function', async () => {
    const { fetch, calls } = mockFetch({ body: order });
    let n = 0;
    await createClient({ academy: 'demo', fetch, token: TOKEN, idempotency: () => `k-${++n}` }).settleFreeOrder('ORD-1');
    expect(calls[0]!.headers['idempotency-key']).toBe('k-1');
  });

  it("'auto' fails clearly when crypto.randomUUID is missing", async () => {
    vi.stubGlobal('crypto', undefined);
    const { fetch, calls } = mockFetch({ body: order });
    await expect(createClient({ academy: 'demo', fetch, idempotency: 'auto' }).createCheckoutOrder()).rejects.toThrow(/randomUUID/);
    expect(calls).toHaveLength(0);
  });

  it('refuses a malformed key before sending anything', async () => {
    const { fetch, calls } = mockFetch({ body: order });
    const tk = createClient({ academy: 'demo', fetch, token: TOKEN });
    await expect(tk.createCheckoutOrder({}, { idempotencyKey: 'has space' })).rejects.toThrow(TypeError);
    await expect(tk.createCheckoutOrder({}, { idempotencyKey: '' })).rejects.toThrow(TypeError);
    await expect(tk.createCheckoutOrder({}, { idempotencyKey: 'x'.repeat(256) })).rejects.toThrow(TypeError);
    expect(calls).toHaveLength(0);
  });

  it('the same key is resent on the opt-in 429 retry', async () => {
    const { fetch, calls } = mockFetch({ status: 429, body: { message: 'slow', retry_after: 0 } }, { status: 201, body: order });
    await createClient({ academy: 'demo', fetch, token: TOKEN, idempotency: 'auto', retry: { on429: true } }).createCheckoutOrder();
    expect(calls).toHaveLength(2);
    expect(calls[1]!.headers['idempotency-key']).toBe(calls[0]!.headers['idempotency-key']);
  });

  it('getResponseMeta exposes replayed, the key sent, status and rate-limit headers', async () => {
    const { fetch } = mockFetch(
      { status: 201, body: order, headers: { 'Idempotent-Replayed': 'true', 'X-RateLimit-Limit': '120', 'X-RateLimit-Remaining': '119' } },
    );
    const res = await createClient({ academy: 'demo', fetch, token: TOKEN }).createCheckoutOrder({}, { idempotencyKey: 'chk-1' });
    expect(res.data.number).toBe('ORD-1');
    const meta = getResponseMeta(res)!;
    expect(meta.status).toBe(201);
    expect(meta.replayed).toBe(true);
    expect(meta.idempotencyKey).toBe('chk-1');
    expect(meta.rateLimit).toEqual({ limit: 120, remaining: 119, reset: null });
    // The result itself is unchanged: no extra enumerable fields.
    expect(Object.keys(res)).toEqual(['data']);
  });

  it('replayed is false without the header, and getResponseMeta is undefined for foreign values', async () => {
    const { fetch } = mockFetch({ status: 201, body: order });
    const res = await createClient({ academy: 'demo', fetch, token: TOKEN }).createCheckoutOrder();
    expect(getResponseMeta(res)!.replayed).toBe(false);
    expect(getResponseMeta(res)!.idempotencyKey).toBeNull();
    expect(getResponseMeta(res)!.rateLimit).toBeNull();
    expect(getResponseMeta({})).toBeUndefined();
    expect(getResponseMeta(null)).toBeUndefined();
  });
});

describe('error mapping for abilities and idempotency', () => {
  const run = async (status: number, body: unknown, headers?: Record<string, string>) => {
    const { fetch } = mockFetch({ status, body, ...(headers ? { headers } : {}) });
    return rejected(createClient({ academy: 'demo', fetch, token: TOKEN }).createCheckoutOrder({}, { idempotencyKey: 'k' }));
  };

  it('403 insufficient_ability → TkawenInsufficientAbilityError (still a TkawenForbiddenError, kind forbidden)', async () => {
    const e = (await run(403, {
      message: 'This token does not carry the «purchase» ability.',
      error: 'insufficient_ability',
      required_ability: 'purchase',
    })) as TkawenInsufficientAbilityError;
    expect(e).toBeInstanceOf(TkawenInsufficientAbilityError);
    expect(e).toBeInstanceOf(TkawenForbiddenError);
    expect(e.kind).toBe('forbidden');
    expect(e.requiredAbility).toBe('purchase');
    expect(e.name).toBe('TkawenInsufficientAbilityError');
  });

  it('a policy 403 stays a plain TkawenForbiddenError', async () => {
    const e = await run(403, { message: 'This action is unauthorized.' });
    expect(e).toBeInstanceOf(TkawenForbiddenError);
    expect(e).not.toBeInstanceOf(TkawenInsufficientAbilityError);
  });

  it('400 invalid_idempotency_key → TkawenIdempotencyError', async () => {
    const e = (await run(400, { message: 'bad key', error: 'invalid_idempotency_key' })) as TkawenIdempotencyError;
    expect(e).toBeInstanceOf(TkawenIdempotencyError);
    expect(e.kind).toBe('idempotency');
    expect(e.code).toBe('invalid_idempotency_key');
    expect(e.retryAfter).toBeNull();
  });

  it('409 idempotency_request_in_progress → TkawenIdempotencyError with retryAfter from Retry-After', async () => {
    const e = (await run(409, { message: 'in progress', error: 'idempotency_request_in_progress' }, { 'Retry-After': '1' })) as TkawenIdempotencyError;
    expect(e).toBeInstanceOf(TkawenIdempotencyError);
    expect(e.code).toBe('idempotency_request_in_progress');
    expect(e.retryAfter).toBe(1);
  });

  it('422 idempotency_key_reused → TkawenIdempotencyError (not a validation error)', async () => {
    const e = (await run(422, { message: 'reused', error: 'idempotency_key_reused' })) as TkawenIdempotencyError;
    expect(e).toBeInstanceOf(TkawenIdempotencyError);
    expect(e).not.toBeInstanceOf(TkawenValidationError);
    expect(e.code).toBe('idempotency_key_reused');
  });

  it('mapping is strict on (status, code): other 409/422 bodies keep their old classes', async () => {
    const paid = await run(409, { message: 'This order is already paid.' });
    expect(paid).not.toBeInstanceOf(TkawenIdempotencyError);
    expect(paid.kind).toBe('http');
    const empty = await run(422, { message: 'The cart is empty.' });
    expect(empty).toBeInstanceOf(TkawenValidationError);
    const mismatched = await run(409, { message: 'x', error: 'idempotency_key_reused' });
    expect(mismatched).not.toBeInstanceOf(TkawenIdempotencyError);
  });
});

describe('abilities and metrics shape', () => {
  it('REQUIRED_ABILITY matches x-token-ability for every operation in the spec', () => {
    const spec = readFileSync(new URL('../../../openapi/tkawen-os-v1.yaml', import.meta.url), 'utf8');
    const expected: Record<string, string | null> = {};
    let op: string | null = null;
    for (const line of spec.split(/\r?\n/)) {
      const id = /^ {6}operationId: (\w+)/.exec(line);
      if (id) {
        op = id[1]!;
        expected[op] = null;
        continue;
      }
      const ab = /^ {6}x-token-ability: (\w+)/.exec(line);
      if (ab && op) expected[op] = ab[1]!;
    }
    expect(Object.keys(expected)).toHaveLength(46);
    expect(REQUIRED_ABILITY).toEqual(expected);
    expect(REQUIRED_ABILITY.createCheckoutOrder).toBe('purchase');
    expect(REQUIRED_ABILITY.getAuthenticatedCaller).toBeNull();
  });

  it('getInstitutionMetrics narrows on scope', () => {
    expectTypeOf<SuccessBody<'getInstitutionMetrics'>>().toEqualTypeOf<InstitutionMetrics>();
    const m = { scope: 'instructor' } as InstitutionMetrics;
    if (m.scope === 'instructor') expectTypeOf(m.totals).toHaveProperty('certificates_issued');
  });
});
