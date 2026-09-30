export {
  verifyCertificate,
  normaliseAcademy,
  normaliseCertify,
  resolveUrls,
  CERTIFY_ORIGIN,
  ACADEMY_ROOT_DOMAIN,
  DEFAULT_TIMEOUT_MS,
} from './client.js';
export type { NormaliseContext, ResolvedUrls } from './client.js';
export type {
  CertifyEndpoint,
  FetchLike,
  Provider,
  VerifyErrorCode,
  VerifyIssuer,
  VerifyOptions,
  VerifyResult,
  VerifyStatus,
} from './types.js';
export { STRINGS, formatDate, pickLang } from './i18n.js';
export type { Lang, Strings } from './i18n.js';
