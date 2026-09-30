import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createClient, type ClientOptions, type FetchLike } from '@tkawen/os-sdk';
import { readConfig } from './config.js';
import { createServer } from './server.js';

export { readConfig, type McpConfig } from './config.js';
export {
  createServer,
  PUBLIC_TOOLS,
  TOKEN_TOOLS,
  SERVER_NAME,
  SERVER_VERSION,
  type CreateServerOptions,
  type ReadOnlyClient,
} from './server.js';

export interface StartOptions {
  env: Record<string, string | undefined>;
  transport: Transport;
  /** Injected fetch (tests). Default: global fetch. */
  fetch?: FetchLike;
}

/** Reads the env, builds the SDK client and connects the server to `transport`. */
export async function startServer(opts: StartOptions): Promise<McpServer> {
  const cfg = readConfig(opts.env);
  const clientOptions: ClientOptions = { academy: cfg.academy };
  if (cfg.baseUrl) clientOptions.baseUrl = cfg.baseUrl;
  if (cfg.token) clientOptions.token = cfg.token;
  if (cfg.locale) clientOptions.locale = cfg.locale;
  if (opts.fetch) clientOptions.fetch = opts.fetch;
  const client = createClient(clientOptions);
  const server = createServer({
    client,
    academy: cfg.academy,
    withToken: cfg.token !== undefined,
    secrets: cfg.token ? [cfg.token] : [],
  });
  await server.connect(opts.transport);
  return server;
}
