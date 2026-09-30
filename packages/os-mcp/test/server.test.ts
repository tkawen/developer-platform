import { describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { TkawenLessonLockedError, TkawenRateLimitError, TkawenUnauthorizedError } from '@tkawen/os-sdk';
import { createServer, PUBLIC_TOOLS, readConfig, startServer, TOKEN_TOOLS, type ReadOnlyClient } from '../src/index.js';

const TOKEN = '7|fake-token-for-tests';

function fakeClient(): { [K in keyof ReadOnlyClient]: ReturnType<typeof vi.fn> } {
  return {
    listCourses: vi.fn(async () => ({ data: [{ slug: 'py' }], links: {}, meta: {} })),
    getCourse: vi.fn(async (slug: string) => ({ data: { slug } })),
    listInstructors: vi.fn(async () => ({ data: [] })),
    getInstructor: vi.fn(async (id: string) => ({ public_id: id })),
    getCatalogueFacets: vi.fn(async () => ({ total: 3 })),
    verifyCertificate: vi.fn(async () => ({ status: 'valid', credential_uid: 'X' })),
    getMyDashboard: vi.fn(async () => ({ continue: [] })),
    listMyCourses: vi.fn(async () => ({ data: [], counts: {} })),
    getMyTranscript: vi.fn(async (slug: string) => ({ data: { slug } })),
  };
}

async function connect(opts: { withToken: boolean; client?: ReturnType<typeof fakeClient>; secrets?: string[] }) {
  const client = opts.client ?? fakeClient();
  const server = createServer({
    client: client as unknown as ReadOnlyClient,
    academy: 'demo',
    withToken: opts.withToken,
    secrets: opts.secrets ?? [],
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const mcp = new Client({ name: 'test', version: '0.0.0' });
  await mcp.connect(b);
  return { mcp, client };
}

const text = (r: unknown) => ((r as { content: { text: string }[] }).content[0]!.text);

describe('tool list', () => {
  it('without a token exposes only the public read-only tools', async () => {
    const { mcp } = await connect({ withToken: false });
    const { tools } = await mcp.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...PUBLIC_TOOLS].sort());
  });

  it('with a token adds the learner tools', async () => {
    const { mcp } = await connect({ withToken: true });
    const { tools } = await mcp.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...PUBLIC_TOOLS, ...TOKEN_TOOLS].sort());
  });

  it('every tool is annotated read-only and says the data is live and read-only', async () => {
    const { mcp } = await connect({ withToken: true });
    const { tools } = await mcp.listTools();
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint).toBe(true);
      expect(t.annotations?.destructiveHint).toBe(false);
      expect(t.description).toMatch(/fetched live/);
      expect(t.description).toMatch(/Read-only/);
    }
  });

  it('exposes no write tool names', async () => {
    const { mcp } = await connect({ withToken: true });
    const names = (await mcp.listTools()).tools.map((t) => t.name).join(' ');
    expect(names).not.toMatch(/cart|checkout|review|discussion|request|wishlist|progress|assignment|pay/);
  });
});

describe('tool calls', () => {
  it('list_courses forwards filters to the SDK and returns JSON text', async () => {
    const { mcp, client } = await connect({ withToken: false });
    const r = await mcp.callTool({ name: 'list_courses', arguments: { q: 'python', level: 'beginner', per_page: 5 } });
    expect(client.listCourses).toHaveBeenCalledWith({ q: 'python', level: 'beginner', per_page: 5 });
    expect(JSON.parse(text(r)).data[0].slug).toBe('py');
  });

  it('get_course / get_instructor / verify_certificate / get_my_transcript pass their argument', async () => {
    const { mcp, client } = await connect({ withToken: true });
    await mcp.callTool({ name: 'get_course', arguments: { slug: 'py' } });
    await mcp.callTool({ name: 'get_instructor', arguments: { public_id: 'ins_1' } });
    await mcp.callTool({ name: 'verify_certificate', arguments: { code: 'TKW-1' } });
    await mcp.callTool({ name: 'get_my_transcript', arguments: { slug: 'py' } });
    expect(client.getCourse).toHaveBeenCalledWith('py');
    expect(client.getInstructor).toHaveBeenCalledWith('ins_1');
    expect(client.verifyCertificate).toHaveBeenCalledWith('TKW-1');
    expect(client.getMyTranscript).toHaveBeenCalledWith('py');
  });

  it('rejects invalid arguments before calling the SDK', async () => {
    const { mcp, client } = await connect({ withToken: false });
    const r = await mcp.callTool({ name: 'list_courses', arguments: { per_page: 500 } });
    expect(r.isError).toBe(true);
    expect(client.listCourses).not.toHaveBeenCalled();
  });

  it('maps API errors to MCP error results with the message', async () => {
    const client = fakeClient();
    const init = { method: 'GET', url: 'https://demo.tkawen.com/api/v1/me/dashboard', operationId: 'getMyDashboard' };
    client.getMyDashboard.mockRejectedValueOnce(new TkawenUnauthorizedError({ ...init, status: 401, body: { message: 'Unauthenticated.' } }));
    client.getCourse.mockRejectedValueOnce(
      new TkawenLessonLockedError({ ...init, operationId: 'getCourse', status: 423, body: { message: 'locked', needs: 'Intro', needs_slug: 'intro' } }),
    );
    client.listInstructors.mockRejectedValueOnce(
      new TkawenRateLimitError({ ...init, operationId: 'listInstructors', status: 429, body: { message: 'slow down', retry_after: 9 } }),
    );
    const { mcp } = await connect({ withToken: true, client });

    const a = await mcp.callTool({ name: 'get_my_dashboard', arguments: {} });
    expect(a.isError).toBe(true);
    expect(text(a)).toBe('TKAWEN API error 401 (unauthorized) on getMyDashboard: Unauthenticated.');

    const b = await mcp.callTool({ name: 'get_course', arguments: { slug: 'x' } });
    expect(text(b)).toContain('needs_slug: intro');

    const c = await mcp.callTool({ name: 'list_instructors', arguments: {} });
    expect(text(c)).toContain('retry after 9 s');
  });

  it('never echoes the token, even if a server message or body contains it', async () => {
    const client = fakeClient();
    client.getMyDashboard.mockRejectedValueOnce(new Error(`boom ${TOKEN}`));
    client.listMyCourses.mockResolvedValueOnce({ echoed: TOKEN });
    const { mcp } = await connect({ withToken: true, client, secrets: [TOKEN] });
    const a = await mcp.callTool({ name: 'get_my_dashboard', arguments: {} });
    const b = await mcp.callTool({ name: 'list_my_courses', arguments: {} });
    expect(text(a)).not.toContain(TOKEN);
    expect(text(b)).not.toContain(TOKEN);
    expect(text(b)).toContain('[redacted]');
  });
});

describe('config', () => {
  it('requires TKAWEN_ACADEMY', () => {
    expect(() => readConfig({})).toThrow(/TKAWEN_ACADEMY/);
  });

  it('reads optional values and ignores blanks', () => {
    expect(readConfig({ TKAWEN_ACADEMY: 'demo', TKAWEN_TOKEN: ' ', TKAWEN_LOCALE: 'fr' })).toEqual({ academy: 'demo', locale: 'fr' });
  });
});

describe('in-process smoke (real SDK, mocked fetch, no network)', () => {
  it('starts from env, lists tools and calls one through the real SDK', async () => {
    const calls: { url: string; auth: string | null }[] = [];
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, auth: new Headers(init?.headers).get('authorization') });
      return new Response(JSON.stringify({ total: 4, categories: [], levels: [], languages: [], price: { free: 1, paid: 3 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await startServer({ env: { TKAWEN_ACADEMY: 'demo', TKAWEN_TOKEN: TOKEN }, transport: a, fetch });
    const mcp = new Client({ name: 'smoke', version: '0.0.0' });
    await mcp.connect(b);

    const { tools } = await mcp.listTools();
    expect(tools).toHaveLength(PUBLIC_TOOLS.length + TOKEN_TOOLS.length);

    const r = await mcp.callTool({ name: 'get_catalogue_facets', arguments: {} });
    expect(JSON.parse(text(r)).total).toBe(4);
    expect(calls[0]!.url).toBe('https://demo.tkawen.com/api/v1/catalogue/facets');
    expect(calls[0]!.auth).toBe(`Bearer ${TOKEN}`);
    await mcp.close();
  });

  it('without a token registers public tools only and sends no Authorization', async () => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBeNull();
      return new Response('{"data":[]}', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await startServer({ env: { TKAWEN_ACADEMY: 'demo' }, transport: a, fetch });
    const mcp = new Client({ name: 'smoke', version: '0.0.0' });
    await mcp.connect(b);
    expect((await mcp.listTools()).tools).toHaveLength(PUBLIC_TOOLS.length);
    await mcp.callTool({ name: 'list_instructors', arguments: {} });
    expect(fetch).toHaveBeenCalledTimes(1);
    await mcp.close();
  });
});
