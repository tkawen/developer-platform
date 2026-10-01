export { createClient, GROUPS } from './client.js';
export type { TkawenClient } from './client.js';
export {
  TkawenApiError,
  TkawenUnauthorizedError,
  TkawenForbiddenError,
  TkawenNotFoundError,
  TkawenValidationError,
  TkawenLessonLockedError,
  TkawenRateLimitError,
  TkawenInsufficientAbilityError,
  TkawenIdempotencyError,
  createApiError,
  isTkawenApiError,
  retryAfterOf,
} from './errors.js';
export type { TkawenErrorKind, TkawenApiErrorInit, TkawenTokenAbility, TkawenIdempotencyErrorCode } from './errors.js';
export { buildUrl, resolveBaseUrl, getResponseMeta } from './http.js';
export { REQUIRED_ABILITY } from './abilities.js';
export type * from './types.js';

export const VERSION = '0.2.0';
