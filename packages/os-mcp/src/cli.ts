#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { startServer } from './index.js';

// stdout carries the MCP protocol; diagnostics go to stderr only, and never include the token.
startServer({ env: process.env, transport: new StdioServerTransport() }).catch((e: unknown) => {
  const token = process.env['TKAWEN_TOKEN'];
  let msg = e instanceof Error ? e.message : String(e);
  if (token && token.length >= 4) msg = msg.split(token).join('[redacted]');
  process.stderr.write(`tkawen-os-mcp: ${msg}\n`);
  process.exit(1);
});
