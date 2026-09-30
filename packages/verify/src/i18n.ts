export type Lang = 'ar' | 'fr' | 'en';

export interface Strings {
  title: string;
  label: string;
  placeholder: string;
  submit: string;
  loading: string;
  valid: string;
  validHint: string;
  revoked: string;
  revokedHint: string;
  expired: string;
  expiredHint: string;
  invalid: string;
  invalidHint: string;
  notFound: string;
  notFoundHint: string;
  rateLimited: string;
  rateLimitedHint: (seconds?: number) => string;
  error: string;
  errorHint: string;
  holder: string;
  course: string;
  issued: string;
  expires: string;
  issuer: string;
  code: string;
  openPage: string;
  poweredBy: string;
}

const ar: Strings = {
  title: 'التحقّق من شهادة',
  label: 'رمز الشهادة',
  placeholder: 'مثال: TK-2026-000123',
  submit: 'تحقّق',
  loading: 'جارٍ التحقّق…',
  valid: 'شهادة صحيحة',
  validHint: 'الجهة المُصدِرة تؤكّد هذه الشهادة.',
  revoked: 'شهادة مسحوبة',
  revokedHint: 'سحبت الجهة المُصدِرة هذه الشهادة ولم تعد سارية.',
  expired: 'شهادة منتهية الصلاحية',
  expiredHint: 'كانت هذه الشهادة صحيحة، وانتهت مدّة صلاحيتها.',
  invalid: 'تعذّر إثبات صحّة الشهادة',
  invalidHint: 'السجلّ موجود لكنّ التوقيع الرقمي لم يُثبت سلامته.',
  notFound: 'لا توجد شهادة بهذا الرمز',
  notFoundHint: 'تأكّد من كتابة الرمز كما هو مطبوع على الشهادة.',
  rateLimited: 'محاولات كثيرة',
  rateLimitedHint: (s) => (s ? `انتظر ${s} ثانية ثم أعد المحاولة.` : 'انتظر قليلًا ثم أعد المحاولة.'),
  error: 'تعذّر الاتصال بخدمة التحقّق',
  errorHint: 'أعد المحاولة، أو افتح صفحة التحقّق لدى الجهة المُصدِرة.',
  holder: 'صاحب الشهادة',
  course: 'التكوين',
  issued: 'تاريخ الإصدار',
  expires: 'تاريخ الانتهاء',
  issuer: 'الجهة المُصدِرة',
  code: 'الرمز',
  openPage: 'صفحة التحقّق الرسمية',
  poweredBy: 'تحقّق عبر TKAWEN',
};

const fr: Strings = {
  title: 'Vérifier un certificat',
  label: 'Code du certificat',
  placeholder: 'ex. TK-2026-000123',
  submit: 'Vérifier',
  loading: 'Vérification…',
  valid: 'Certificat valide',
  validHint: "L'émetteur confirme ce certificat.",
  revoked: 'Certificat révoqué',
  revokedHint: "L'émetteur a retiré ce certificat ; il n'est plus valable.",
  expired: 'Certificat expiré',
  expiredHint: 'Ce certificat était valide et a dépassé sa date de validité.',
  invalid: 'Authenticité non établie',
  invalidHint: "L'enregistrement existe mais la signature numérique n'a pas pu être vérifiée.",
  notFound: 'Aucun certificat avec ce code',
  notFoundHint: 'Vérifiez le code tel qu’il est imprimé sur le certificat.',
  rateLimited: 'Trop de tentatives',
  rateLimitedHint: (s) => (s ? `Patientez ${s} s puis réessayez.` : 'Patientez un instant puis réessayez.'),
  error: 'Service de vérification injoignable',
  errorHint: "Réessayez, ou ouvrez la page de vérification de l'émetteur.",
  holder: 'Titulaire',
  course: 'Formation',
  issued: 'Délivré le',
  expires: 'Expire le',
  issuer: 'Émetteur',
  code: 'Code',
  openPage: 'Page de vérification officielle',
  poweredBy: 'Vérifié via TKAWEN',
};

const en: Strings = {
  title: 'Verify a certificate',
  label: 'Certificate code',
  placeholder: 'e.g. TK-2026-000123',
  submit: 'Verify',
  loading: 'Verifying…',
  valid: 'Valid certificate',
  validHint: 'The issuer confirms this certificate.',
  revoked: 'Certificate revoked',
  revokedHint: 'The issuer withdrew this certificate; it is no longer valid.',
  expired: 'Certificate expired',
  expiredHint: 'This certificate was valid and has passed its expiry date.',
  invalid: 'Authenticity not established',
  invalidHint: 'The record exists but its digital signature could not be verified.',
  notFound: 'No certificate with this code',
  notFoundHint: 'Check the code exactly as printed on the certificate.',
  rateLimited: 'Too many attempts',
  rateLimitedHint: (s) => (s ? `Wait ${s} seconds, then try again.` : 'Wait a moment, then try again.'),
  error: 'Could not reach the verification service',
  errorHint: "Try again, or open the issuer's verification page.",
  holder: 'Holder',
  course: 'Course',
  issued: 'Issued',
  expires: 'Expires',
  issuer: 'Issuer',
  code: 'Code',
  openPage: 'Official verification page',
  poweredBy: 'Verified via TKAWEN',
};

export const STRINGS: Record<Lang, Strings> = { ar, fr, en };

export function pickLang(v: string | null | undefined): Lang {
  const l = String(v ?? '').toLowerCase().slice(0, 2);
  return l === 'ar' || l === 'fr' ? l : 'en';
}

/** Localised date, always Western (Latin) digits. Unparseable input is returned as-is. */
export function formatDate(value: string | undefined, lang: Lang): string | undefined {
  if (!value) return undefined;
  const t = Date.parse(value.includes('T') ? value : value.replace(' ', 'T'));
  if (!Number.isFinite(t)) return value;
  try {
    return new Intl.DateTimeFormat(`${lang}-u-nu-latn`, { year: 'numeric', month: 'long', day: 'numeric' }).format(t);
  } catch {
    return new Date(t).toISOString().slice(0, 10);
  }
}
