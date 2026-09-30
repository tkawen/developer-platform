export interface McpConfig {
  academy: string;
  baseUrl?: string;
  token?: string;
  locale?: string;
}

const nonEmpty = (v: string | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t : undefined;
};

/**
 * Reads TKAWEN_ACADEMY (required), TKAWEN_BASE_URL, TKAWEN_TOKEN and TKAWEN_LOCALE.
 * Error messages never contain the token value.
 */
export function readConfig(env: Record<string, string | undefined>): McpConfig {
  const academy = nonEmpty(env['TKAWEN_ACADEMY']);
  if (!academy) {
    throw new Error('TKAWEN_ACADEMY is required (the academy subdomain, e.g. "demo" for demo.tkawen.com).');
  }
  const cfg: McpConfig = { academy };
  const baseUrl = nonEmpty(env['TKAWEN_BASE_URL']);
  const token = nonEmpty(env['TKAWEN_TOKEN']);
  const locale = nonEmpty(env['TKAWEN_LOCALE']);
  if (baseUrl) cfg.baseUrl = baseUrl;
  if (token) cfg.token = token;
  if (locale) cfg.locale = locale;
  return cfg;
}
