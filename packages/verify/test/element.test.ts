import { afterEach, describe, expect, it, vi } from 'vitest';
import { RESULT_EVENT, TkawenVerifyElement } from '../src/element.js';
import type { VerifyResult } from '../src/types.js';
import * as f from './fixtures.js';

type Attrs = Record<string, string>;

function mount(attrs: Attrs, fetchImpl: TkawenVerifyElement['fetchImpl']): TkawenVerifyElement {
  const el = document.createElement('tkawen-verify');
  el.fetchImpl = fetchImpl;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function nextResult(el: HTMLElement): Promise<VerifyResult> {
  return new Promise((resolve) =>
    el.addEventListener(RESULT_EVENT, (e) => resolve((e as CustomEvent<VerifyResult>).detail), { once: true }),
  );
}

const shadow = (el: HTMLElement) => el.shadowRoot!;
const status = (el: HTMLElement) => shadow(el).querySelector('[role="status"]')!;
const stateOf = (el: HTMLElement) => shadow(el).querySelector('[data-state]')?.getAttribute('data-state');

async function run(attrs: Attrs, response: () => Promise<Response>) {
  const fetch = vi.fn(response);
  const el = mount(attrs, fetch);
  const done = nextResult(el);
  document.body.append(el);
  const result = await done;
  return { el, result, fetch };
}

const academy = { code: 'TK-1', provider: 'academy', academy: 'code', lang: 'en' };

afterEach(() => {
  document.body.replaceChildren();
});

describe('<tkawen-verify>', () => {
  it('is registered', () => {
    expect(customElements.get('tkawen-verify')).toBe(TkawenVerifyElement);
  });

  it('shows loading while the request is in flight, with aria-busy', async () => {
    let release!: (r: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>((r) => (release = r)));
    const el = mount(academy, fetch);
    const done = nextResult(el);
    document.body.append(el);
    await vi.waitFor(() => expect(stateOf(el)).toBe('loading'));
    expect(status(el).getAttribute('aria-busy')).toBe('true');
    expect(el.getAttribute('state')).toBe('loading');
    release(f.jsonResponse(f.academyValid));
    await done;
    expect(status(el).hasAttribute('aria-busy')).toBe(false);
  });

  it('renders valid with holder, course and an official link; untrusted text stays text', async () => {
    const { el, result } = await run(academy, async () =>
      f.jsonResponse({ ...f.academyValid, student_name: '<img src=x onerror=alert(1)>' }),
    );
    expect(result.status).toBe('valid');
    expect(stateOf(el)).toBe('valid');
    const text = status(el).textContent!;
    expect(text).toContain('Valid certificate');
    expect(text).toContain('<img src=x onerror=alert(1)>');
    expect(shadow(el).querySelector('img')).toBeNull();
    expect(text).toContain('Laravel Fundamentals');
    const a = shadow(el).querySelector('a')!;
    expect(a.getAttribute('href')).toBe('https://code.tkawen.com/certificates/verify/TK-1');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('renders revoked', async () => {
    const { el } = await run(academy, async () => f.jsonResponse({ ...f.academyValid, status: 'revoked' }));
    expect(stateOf(el)).toBe('revoked');
    expect(status(el).textContent).toContain('Certificate revoked');
  });

  it('renders expired (Algeria Certify)', async () => {
    const { el } = await run({ code: 'AC-2026-0001', provider: 'certify', lang: 'en' }, async () =>
      f.jsonResponse({ ...f.certifyActive, status: 'expired', is_valid: false }),
    );
    expect(stateOf(el)).toBe('expired');
    expect(status(el).textContent).toContain('Institut Annaba');
  });

  it('renders invalid for a failed signature', async () => {
    const { el } = await run(academy, async () => f.jsonResponse({ ...f.academyValid, status: 'tampered' }));
    expect(stateOf(el)).toBe('invalid');
  });

  it('renders not-found', async () => {
    const { el } = await run(academy, async () => f.jsonResponse(f.academyNotFound, 404));
    expect(stateOf(el)).toBe('not-found');
    expect(status(el).textContent).toContain('No certificate with this code');
  });

  it('renders rate-limited with the wait in Western digits', async () => {
    const { el } = await run({ ...academy, lang: 'ar' }, async () => f.jsonResponse(f.academy429, 429));
    expect(stateOf(el)).toBe('rate-limited');
    expect(status(el).textContent).toContain('42');
    expect(status(el).textContent).not.toMatch(/[٠-٩]/);
  });

  it('renders error on a network/CORS failure', async () => {
    const { el } = await run(academy, async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(stateOf(el)).toBe('error');
  });

  it('is RTL for Arabic and uses Latin digits in dates', async () => {
    const { el } = await run({ ...academy, lang: 'ar' }, async () => f.jsonResponse(f.academyValid));
    const card = shadow(el).querySelector('.card')!;
    expect(card.getAttribute('dir')).toBe('rtl');
    expect(status(el).textContent).toContain('شهادة صحيحة');
    expect(status(el).textContent).toContain('2026');
    expect(status(el).textContent).not.toMatch(/[٠-٩۰-۹]/);
  });

  it('uses French strings for lang="fr"', async () => {
    const { el } = await run({ ...academy, lang: 'fr' }, async () => f.jsonResponse(f.academyValid));
    expect(shadow(el).querySelector('.card')!.getAttribute('dir')).toBe('ltr');
    expect(status(el).textContent).toContain('Certificat valide');
  });

  it('exposes an accessible live region', async () => {
    const { el } = await run(academy, async () => f.jsonResponse(f.academyValid));
    expect(status(el).getAttribute('aria-live')).toBe('polite');
    expect(status(el).getAttribute('aria-atomic')).toBe('true');
  });

  it('form mode: no code attribute renders a labelled input and verifies on submit', async () => {
    const fetch = vi.fn(async (_u: string, _i?: RequestInit) => f.jsonResponse(f.certifyActive));
    const el = mount({ provider: 'certify', lang: 'en' }, fetch);
    document.body.append(el);
    const input = shadow(el).querySelector('input')!;
    const label = shadow(el).querySelector('label')!;
    expect(label.getAttribute('for')).toBe(input.id);
    expect(fetch).not.toHaveBeenCalled();

    // Empty submit does nothing.
    shadow(el).querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(fetch).not.toHaveBeenCalled();

    input.value = ' tkawen_ABC123 ';
    const done = nextResult(el);
    shadow(el).querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    const r = await done;
    expect(r.status).toBe('valid');
    expect(fetch.mock.calls[0]![0]).toBe('https://algeriacertify.com/api/public/v1/certificate/tkawen_ABC123');
    expect(stateOf(el)).toBe('valid');
    expect(shadow(el).querySelector('button')!.disabled).toBe(false);
  });

  it('re-verifies when the code attribute changes and ignores the stale answer', async () => {
    const resolvers: Array<(r: Response) => void> = [];
    const fetch = vi.fn(() => new Promise<Response>((r) => resolvers.push(r)));
    const el = mount(academy, fetch);
    document.body.append(el);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const done = nextResult(el);
    el.setAttribute('code', 'TK-2');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    resolvers[1]!(f.jsonResponse(f.academyNotFound, 404));
    const r = await done;
    expect(r.code).toBe('TK-2');
    resolvers[0]!(f.jsonResponse(f.academyValid));
    await new Promise((r) => setTimeout(r, 10));
    expect(stateOf(el)).toBe('not-found');
  });

  it('renders error for invalid attributes without calling fetch', async () => {
    const { el, fetch } = await run({ code: 'TK-1', provider: 'academy', lang: 'en' }, async () => f.jsonResponse(f.academyValid));
    expect(fetch).not.toHaveBeenCalled();
    expect(stateOf(el)).toBe('error');
  });
});
