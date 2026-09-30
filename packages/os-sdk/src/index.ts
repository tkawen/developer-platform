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
  createApiError,
  isTkawenApiError,
  retryAfterOf,
} from './errors.js';
export type { TkawenErrorKind, TkawenApiErrorInit } from './errors.js';
export { buildUrl, resolveBaseUrl } from './http.js';
export type * from './types.js';

export const VERSION = '0.1.0';
