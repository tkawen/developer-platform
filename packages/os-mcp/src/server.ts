import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { isTkawenApiError, type TkawenClient } from '@tkawen/os-sdk';
import { z } from 'zod';

export const SERVER_NAME = 'tkawen-os';
export const SERVER_VERSION = '0.1.0';

/** Tools available without a token (public operations of the spec). */
export const PUBLIC_TOOLS = [
  'list_courses',
  'get_course',
  'list_instructors',
  'get_instructor',
  'get_catalogue_facets',
  'verify_certificate',
] as const;

/** Tools registered only when TKAWEN_TOKEN is set (learner's own data). */
export const TOKEN_TOOLS = ['get_my_dashboard', 'list_my_courses', 'get_my_transcript'] as const;

/** The subset of the SDK client this server calls, all read-only GET operations. */
export type ReadOnlyClient = Pick<
  TkawenClient,
  | 'listCourses'
  | 'getCourse'
  | 'listInstructors'
  | 'getInstructor'
  | 'getCatalogueFacets'
  | 'verifyCertificate'
  | 'getMyDashboard'
  | 'listMyCourses'
  | 'getMyTranscript'
>;

export interface CreateServerOptions {
  client: ReadOnlyClient;
  academy: string;
  /** Register the token-only tools. */
  withToken: boolean;
  /** Values that must never appear in tool output (e.g. the token). */
  secrets?: string[];
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;

function redact(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets) if (s && s.length >= 4) out = out.split(s).join('[redacted]');
  return out;
}

export function createServer(opts: CreateServerOptions): McpServer {
  const { client, academy, withToken } = opts;
  const secrets = (opts.secrets ?? []).filter(Boolean);
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  const origin = `Data is fetched live from the "${academy}" TKAWEN OS academy (/api/v1). Read-only: this tool never changes anything.`;
  const mine = `${origin} Uses the configured learner token and returns only that learner's own data.`;

  const run = async (fn: () => Promise<unknown>): Promise<CallToolResult> => {
    try {
      const body = await fn();
      return { content: [{ type: 'text', text: redact(JSON.stringify(body, null, 2), secrets) }] };
    } catch (e) {
      let text: string;
      if (isTkawenApiError(e)) {
        text = `TKAWEN API error ${e.status} (${e.kind}) on ${e.operationId}: ${e.message}`;
        const extra = e as { needs?: unknown; needsSlug?: unknown; retryAfter?: unknown };
        if (e.kind === 'lesson_locked') text += ` [needs: ${String(extra.needs)}, needs_slug: ${String(extra.needsSlug)}]`;
        if (e.kind === 'rate_limited' && extra.retryAfter != null) text += ` [retry after ${String(extra.retryAfter)} s]`;
      } else {
        text = `Request failed: ${e instanceof Error ? e.message : String(e)}`;
      }
      return { isError: true, content: [{ type: 'text', text: redact(text, secrets) }] };
    }
  };

  server.registerTool(
    'list_courses',
    {
      title: 'List courses',
      description: `List the academy's published courses (paginated; filters and Arabic-aware search). ${origin}`,
      inputSchema: {
        q: z.string().max(200).optional().describe('Search text (Arabic-aware) over title, description, category, tags.'),
        category: z.string().max(160).optional().describe('Exact category.'),
        level: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
        language: z.enum(['ar', 'fr', 'en']).optional(),
        price: z.enum(['free', 'paid']).optional(),
        sort: z.enum(['newest', 'popular', 'price_asc', 'price_desc']).optional(),
        per_page: z.number().int().min(1).max(50).optional().describe('1..50, default 12.'),
        page: z.number().int().min(1).optional(),
      },
      annotations: READ_ONLY,
    },
    (args) => run(() => client.listCourses(args)),
  );

  server.registerTool(
    'get_course',
    {
      title: 'Get course',
      description: `One published course by slug, with modules, lessons, prerequisites and rating. ${origin}`,
      inputSchema: { slug: z.string().min(1).max(255).describe('Course slug.') },
      annotations: READ_ONLY,
    },
    ({ slug }) => run(() => client.getCourse(slug)),
  );

  server.registerTool(
    'list_instructors',
    {
      title: 'List instructors',
      description: `Faculty directory: people teaching at least one published course. ${origin}`,
      annotations: READ_ONLY,
    },
    () => run(() => client.listInstructors()),
  );

  server.registerTool(
    'get_instructor',
    {
      title: 'Get instructor',
      description: `Public instructor profile and their published courses. ${origin}`,
      inputSchema: { public_id: z.string().min(1).max(160).describe('Instructor public id.') },
      annotations: READ_ONLY,
    },
    ({ public_id }) => run(() => client.getInstructor(public_id)),
  );

  server.registerTool(
    'get_catalogue_facets',
    {
      title: 'Catalogue facets',
      description: `Category, level, language and price filter values with course counts. ${origin}`,
      annotations: READ_ONLY,
    },
    () => run(() => client.getCatalogueFacets()),
  );

  server.registerTool(
    'verify_certificate',
    {
      title: 'Verify certificate',
      description:
        `Verify a certificate by its code or credential UID. Returns the verdict (valid/revoked/…) or status "not_found". ` +
        `Every attempt is logged by the academy and limited to 10/min per IP. ${origin}`,
      inputSchema: { code: z.string().min(1).max(128).describe('Certificate code or credential UID.') },
      annotations: READ_ONLY,
    },
    ({ code }) => run(() => client.verifyCertificate(code)),
  );

  if (withToken) {
    server.registerTool(
      'get_my_dashboard',
      {
        title: 'My dashboard',
        description: `The learner's home: courses to continue, pending items, certificates, recommendations. ${mine}`,
        annotations: READ_ONLY,
      },
      () => run(() => client.getMyDashboard()),
    );

    server.registerTool(
      'list_my_courses',
      {
        title: 'My courses',
        description: `The learner's courses with state, resume point, assessment and certificate. ${mine}`,
        annotations: READ_ONLY,
      },
      () => run(() => client.listMyCourses()),
    );

    server.registerTool(
      'get_my_transcript',
      {
        title: 'My transcript',
        description: `Weighted gradebook of the learner's enrolment in one course. ${mine}`,
        inputSchema: { slug: z.string().min(1).max(255).describe('Course slug.') },
        annotations: READ_ONLY,
      },
      ({ slug }) => run(() => client.getMyTranscript(slug)),
    );
  }

  return server;
}
