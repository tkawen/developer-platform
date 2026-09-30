import { describe, expect, it, vi } from 'vitest';
import { normaliseAcademy, normaliseCertify, resolveUrls, verifyCertificate } from '../src/index.js';
import * as f from './fixtures.js';

const ctxA = { code: 'TK-1', verifyUrl: 'https://code.tkawen.com/certificates/verify/TK-1', academy: 'code' };
const ctxC = { code: 'AC-2026-0001', verifyUrl: 'https://algeriacertify.com/verify/AC-2026-0001' };

describe('resolveUrls', () => {
  it('builds the academy tenant URL and human page', () => {
    expect(resolveUrls({ code: 'TK-1', provider: 'academy', academy: 'Code' })).toEqual({
      origin: 'https://code.tkawen.com',
      apiUrl: 'https://code.tkawen.com/api/v1/verify/TK-1',
      verifyUrl: 'https://code.tkawen.com/certificates/verify/TK-1',
    });
  });
  it('honours baseUrl and strips trailing slashes', () => {
    expect(resolveUrls({ code: 'X', provider: 'academy', baseUrl: 'https://code.tkawen.online/' }).apiUrl).toBe(
      'https://code.tkawen.online/api/v1/verify/X',
    );
  });
  it('builds both Algeria Certify endpoints', () => {
    expect(resolveUrls({ code: 'tkawen_A1', provider: 'certify' }).apiUrl).toBe(
      'https://algeriacertify.com/api/public/v1/certificate/tkawen_A1',
    );
    expect(resolveUrls({ code: 'tkawen_A1', provider: 'certify', certifyEndpoint: 'verify' }).apiUrl).toBe(
      'https://algeriacertify.com/api/v1/public/verify/tkawen_A1',
    );
  });
  it('rejects unsafe input', () => {
    expect(() => resolveUrls({ code: '../admin', provider: 'certify' })).toThrow(TypeError);
    expect(() => resolveUrls({ code: 'a/b', provider: 'academy', academy: 'code' })).toThrow(TypeError);
    expect(() => resolveUrls({ code: 'X', provider: 'academy', academy: 'evil.com/x' })).toThrow(TypeError);
    expect(() => resolveUrls({ code: 'X', provider: 'academy' })).toThrow(TypeError);
    expect(() => resolveUrls({ code: 'X', provider: 'academy', baseUrl: 'http://example.com' })).toThrow(TypeError);
    expect(() => resolveUrls({ code: 'X', provider: 'academy', baseUrl: 'javascript:alert(1)' })).toThrow(TypeError);
    expect(() => resolveUrls({ code: 'X', provider: 'nope' as never })).toThrow(TypeError);
  });
});

describe('normaliseAcademy', () => {
  it('maps valid', () => {
    const r = normaliseAcademy(f.academyValid, 200, ctxA);
    expect(r).toMatchObject({
      valid: true,
      status: 'valid',
      reason: 'valid',
      holderName: 'Amina Benali',
      courseName: 'Laravel Fundamentals',
      issuedAt: '2026-09-01T10:00:00+01:00',
      credentialId: f.academyValid.credential_uid,
      issuer: { provider: 'academy', slug: 'code' },
      verifyUrl: ctxA.verifyUrl,
      httpStatus: 200,
    });
    expect(r.raw).toBe(f.academyValid);
  });
  it('maps revoked', () => {
    expect(normaliseAcademy({ ...f.academyValid, status: 'revoked' }, 200, ctxA)).toMatchObject({ valid: false, status: 'revoked' });
  });
  it.each(['unsigned', 'tampered', 'unknown_key', 'invalid_signature'])('maps %s to invalid', (s) => {
    const r = normaliseAcademy({ ...f.academyValid, status: s }, 200, ctxA);
    expect(r).toMatchObject({ valid: false, status: 'invalid', reason: s });
  });
  it('maps 404', () => {
    expect(normaliseAcademy(f.academyNotFound, 404, ctxA)).toMatchObject({ valid: false, status: 'not-found', reason: 'not_found' });
  });
  it('maps 429 with retry_after', () => {
    expect(normaliseAcademy(f.academy429, 429, ctxA)).toMatchObject({ status: 'rate-limited', retryAfter: 42 });
  });
  it('treats unknown statuses and shapes as errors, never as valid', () => {
    expect(normaliseAcademy({ status: 'maybe' }, 200, ctxA)).toMatchObject({ valid: false, status: 'error', error: 'bad_response' });
    expect(normaliseAcademy('nope', 200, ctxA)).toMatchObject({ valid: false, status: 'error' });
    expect(normaliseAcademy({}, 500, ctxA)).toMatchObject({ status: 'error', error: 'http_error' });
  });
});

describe('normaliseCertify (embed endpoint)', () => {
  it('maps active', () => {
    expect(normaliseCertify(f.certifyActive, 200, ctxC)).toMatchObject({
      valid: true,
      status: 'valid',
      holderName: 'Yacine Haddad',
      courseName: 'Barbering Level 1',
      credentialId: 'tkawen_ABC123',
      issuer: {
        provider: 'certify',
        name: 'Institut Annaba',
        slug: 'institut-annaba',
        profileUrl: 'https://algeriacertify.com/institut-annaba',
      },
      verifyUrl: 'https://algeriacertify.com/v/tkawen_ABC123',
    });
  });
  it('maps revoked and expired', () => {
    expect(normaliseCertify({ ...f.certifyActive, status: 'revoked', is_valid: false }, 200, ctxC).status).toBe('revoked');
    expect(normaliseCertify({ ...f.certifyActive, status: 'expired', is_valid: false }, 200, ctxC).status).toBe('expired');
  });
  it('re-checks expiry against the clock', () => {
    const r = normaliseCertify({ ...f.certifyActive, expires_at: '2026-01-01T00:00:00Z' }, 200, { ...ctxC, now: new Date('2026-09-30') });
    expect(r).toMatchObject({ valid: false, status: 'expired' });
  });
  it('drops non-http verify/profile URLs from the body', () => {
    const r = normaliseCertify(
      { ...f.certifyActive, verify_url: 'javascript:alert(1)', issuer: { name: 'x', profile_url: 'data:text/html,x' } },
      200,
      ctxC,
    );
    expect(r.verifyUrl).toBe(ctxC.verifyUrl);
    expect(r.issuer.profileUrl).toBeUndefined();
  });
  it('maps 404 and 429', () => {
    expect(normaliseCertify(f.certifyNotFound, 404, ctxC).status).toBe('not-found');
    const r = normaliseCertify({ message: 'Too Many Attempts.' }, 429, ctxC);
    expect(r.status).toBe('rate-limited');
    expect(r.retryAfter).toBeUndefined();
  });
  it('rejects unknown statuses', () => {
    expect(normaliseCertify({ ...f.certifyActive, status: 'pending' }, 200, ctxC)).toMatchObject({ valid: false, status: 'error' });
  });
});

describe('normaliseCertify (full v1 endpoint)', () => {
  const withCert = (patch: Record<string, unknown>) => ({
    ...f.certifyV1,
    data: { ...f.certifyV1.data, certificate: { ...f.certifyV1.data.certificate, ...patch } },
  });

  it('maps a live certificate', () => {
    expect(normaliseCertify(f.certifyV1, 200, ctxC)).toMatchObject({
      valid: true,
      status: 'valid',
      holderName: 'Yacine Haddad',
      issuedAt: '2026-05-10 09:00:00',
      issuer: { provider: 'certify', name: 'Institut Annaba', slug: 'institut-annaba' },
      verifyUrl: 'https://algeriacertify.com/v/TKAWEN_ABC123',
    });
  });
  it('maps revoked (flag or non-active status)', () => {
    expect(normaliseCertify(withCert({ is_revoked: true }), 200, ctxC).status).toBe('revoked');
    expect(normaliseCertify(withCert({ status: 'suspended' }), 200, ctxC).status).toBe('revoked');
  });
  it('computes expiry from a raw DB datetime', () => {
    const r = normaliseCertify(withCert({ expires_at: '2025-12-31 23:59:59' }), 200, { ...ctxC, now: new Date('2026-09-30') });
    expect(r.status).toBe('expired');
  });
  it('maps its 404 body', () => {
    expect(normaliseCertify(f.certifyV1NotFound, 404, ctxC).status).toBe('not-found');
  });
});

describe('verifyCertificate', () => {
  it('calls the academy endpoint once, without credentials, and normalises', async () => {
    const fetch = vi.fn(async (_u: string, _i?: RequestInit) => f.jsonResponse(f.academyValid));
    const r = await verifyCertificate({ code: ' TK-1 ', provider: 'academy', academy: 'code', fetch });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://code.tkawen.com/api/v1/verify/TK-1');
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit', mode: 'cors', headers: { Accept: 'application/json' } });
    expect(r).toMatchObject({ valid: true, status: 'valid', code: 'TK-1' });
  });

  it('returns not-found on 404', async () => {
    const fetch = vi.fn(async () => f.jsonResponse(f.certifyNotFound, 404));
    expect((await verifyCertificate({ code: 'AC-X', provider: 'certify', fetch })).status).toBe('not-found');
  });

  it('returns rate-limited and reads retry_after from the body', async () => {
    const fetch = vi.fn(async () => f.jsonResponse(f.academy429, 429));
    expect(await verifyCertificate({ code: 'TK-1', provider: 'academy', academy: 'code', fetch })).toMatchObject({
      status: 'rate-limited',
      retryAfter: 42,
    });
  });

  it('falls back to the Retry-After header when readable', async () => {
    const fetch = vi.fn(async () => f.jsonResponse({ message: 'Too Many Attempts.' }, 429, { 'Retry-After': '17' }));
    expect((await verifyCertificate({ code: 'AC-X', provider: 'certify', fetch })).retryAfter).toBe(17);
  });

  it('reports a network/CORS failure as error, not as not-found', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await verifyCertificate({ code: 'TK-1', provider: 'academy', academy: 'code', fetch })).toMatchObject({
      valid: false,
      status: 'error',
      error: 'network',
    });
  });

  it('times out', async () => {
    const fetch = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_res, rej) =>
          init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))),
        ),
    );
    expect(await verifyCertificate({ code: 'TK-1', provider: 'academy', academy: 'code', fetch, timeoutMs: 20 })).toMatchObject({
      status: 'error',
      error: 'timeout',
    });
  });

  it('reports non-JSON bodies as bad_response', async () => {
    const fetch = vi.fn(async () => new Response('<html>502</html>', { status: 502 }));
    expect(await verifyCertificate({ code: 'TK-1', provider: 'academy', academy: 'code', fetch })).toMatchObject({
      status: 'error',
      error: 'bad_response',
      httpStatus: 502,
    });
  });

  it('never calls fetch for invalid input', async () => {
    const fetch = vi.fn();
    const r = await verifyCertificate({ code: '', provider: 'academy', academy: 'code', fetch });
    expect(r).toMatchObject({ status: 'error', error: 'invalid_input' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses globalThis.fetch when none is passed', async () => {
    const g = vi.fn(async () => f.jsonResponse(f.certifyActive));
    vi.stubGlobal('fetch', g);
    expect((await verifyCertificate({ code: 'AC-2026-0001', provider: 'certify' })).status).toBe('valid');
    expect(g).toHaveBeenCalledOnce();
  });
});
