// Response bodies copied field-for-field from the server source (see ENDPOINTS.md).

/** Response shape observed in the server source. */
export const academyValid = {
  status: 'valid',
  credential_uid: '9b1f0c1e-2d4a-4c1b-9f55-2d1c1a7e0b11',
  issued_at: '2026-09-01T10:00:00+01:00',
  student_name: 'Amina Benali',
  course_title: 'Laravel Fundamentals',
};
export const academyNotFound = { status: 'not_found' };
/** Response shape observed in the server source. */
export const academy429 = { message: 'محاولات كثيرة في وقت قصير. انتظر 42 ثانية ثم أعد المحاولة.', retry_after: 42 };

/** Response shape observed in the server source. */
export const certifyActive = {
  token: 'tkawen_ABC123',
  certificate_code: 'AC-2026-0001',
  fullname: 'Yacine Haddad',
  course: 'Barbering Level 1',
  issuer: { name: 'Institut Annaba', slug: 'institut-annaba', profile_url: 'https://algeriacertify.com/institut-annaba' },
  issued_at: '2026-05-10T09:00:00+01:00',
  expires_at: null as string | null,
  status: 'active',
  is_valid: true,
  verify_url: 'https://algeriacertify.com/v/tkawen_ABC123',
};
export const certifyNotFound = { error: 'not_found' };

/** Response shape observed in the server source. */
export const certifyV1 = {
  success: true,
  data: {
    certificate: {
      id: 12,
      certificate_code: 'AC-2026-0001',
      token: 'TKAWEN_ABC123',
      status: 'active',
      is_revoked: false,
      course: 'Barbering Level 1',
      validate_date: null,
      issued_at: '2026-05-10 09:00:00',
      revoked_at: null,
      expires_at: null as string | null,
      verify_url: 'https://algeriacertify.com/v/TKAWEN_ABC123',
    },
    recipient: { fullname: 'Yacine Haddad', did: null, username: null },
    issuer: { id: 3, name: 'Institut Annaba', slug: 'institut-annaba', rank: null, trust_score: 80 },
    vti: { score: 91.5, breakdown: {} },
    integrity: { sealed: false, is_intact: false, hash: null, signature: null, sealed_at: null, algorithm: null, canonical_recipe: null },
  },
  meta: { version: 'v1', timestamp: '2026-09-30T10:00:00+01:00' },
};
export const certifyV1NotFound = { success: false, message: 'Certificate not found.', error: 'not_found' };

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? '' : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}
