import { vi } from 'vitest';

export interface Recorded {
  url: string;
  init: RequestInit;
  headers: Record<string, string>;
}

type Reply = { status?: number; body?: unknown; headers?: Record<string, string> } | Response;

/** A fetch mock that answers from a queue and records every call. No network. */
export function mockFetch(...replies: Reply[]) {
  const calls: Recorded[] = [];
  const queue = [...replies];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const h = new Headers(init?.headers);
    const headers: Record<string, string> = {};
    h.forEach((v, k) => (headers[k] = v));
    calls.push({ url, init: init ?? {}, headers });
    const r = queue.length > 1 ? queue.shift()! : queue[0];
    if (r instanceof Response) return r;
    const body = r?.body === undefined ? '' : typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    return new Response(body, {
      status: r?.status ?? 200,
      headers: { 'content-type': 'application/json', ...(r?.headers ?? {}) },
    });
  });
  return { fetch: fn, calls };
}
