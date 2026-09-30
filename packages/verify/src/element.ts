import { verifyCertificate } from './client.js';
import { STRINGS, formatDate, pickLang, type Lang, type Strings } from './i18n.js';
import type { CertifyEndpoint, FetchLike, Provider, VerifyResult } from './types.js';

export const TAG_NAME = 'tkawen-verify';
export const RESULT_EVENT = 'tkawen-verify';

const STYLE = `
:host{all:initial;display:block;max-width:480px;color-scheme:light;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Arabic",Tahoma,Arial,sans-serif;
  font-size:15px;line-height:1.5;color:#0F172A;font-variant-numeric:lining-nums tabular-nums}
:host([hidden]){display:none}
*{box-sizing:border-box}
.card{background:#FFFFFF;border:1px solid #DBEAFE;border-radius:12px;padding:16px;box-shadow:0 1px 2px rgba(15,23,42,.06)}
.title{margin:0 0 10px;font-size:16px;font-weight:700;color:#1D4ED8}
form{margin:0 0 12px}
label{display:block;font-weight:600;margin:0 0 6px;font-size:14px}
.row{display:flex;gap:8px;flex-wrap:wrap}
input{flex:1 1 180px;min-width:0;font:inherit;padding:10px 12px;border:1px solid #93C5FD;border-radius:8px;background:#FFFFFF;color:#0F172A;direction:ltr;text-align:start}
input::placeholder{color:#64748B}
button{font:inherit;font-weight:600;padding:10px 18px;border:0;border-radius:8px;background:#1D4ED8;color:#FFFFFF;cursor:pointer;min-height:44px}
button:hover{background:#2563EB}
button[disabled]{opacity:.6;cursor:not-allowed}
input:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid #2563EB;outline-offset:2px}
.out:empty{display:none}
.state{display:flex;gap:12px;align-items:flex-start}
.icon{flex:0 0 36px;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.icon svg{width:20px;height:20px}
.headline{margin:0;font-weight:700;font-size:16px}
.hint{margin:2px 0 0;color:#334155;font-size:14px}
dl{margin:12px 0 0;display:grid;grid-template-columns:max-content 1fr;gap:4px 12px;font-size:14px}
dt{color:#475569}
dd{margin:0;font-weight:600;overflow-wrap:anywhere}
.code{direction:ltr;unicode-bidi:isolate;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:500}
.foot{margin:12px 0 0;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:13px}
a{color:#1D4ED8;text-decoration:underline;text-underline-offset:2px}
.brand{color:#64748B}
.s-valid .icon{background:#DBEAFE;color:#1D4ED8}.s-valid .headline{color:#1D4ED8}
.s-revoked .icon,.s-invalid .icon,.s-error .icon{background:#FEE2E2;color:#B91C1C}
.s-revoked .headline,.s-invalid .headline,.s-error .headline{color:#B91C1C}
.s-expired .icon,.s-rate-limited .icon{background:#FEF3C7;color:#92400E}
.s-expired .headline,.s-rate-limited .headline{color:#92400E}
.s-not-found .icon{background:#F1F5F9;color:#334155}.s-not-found .headline{color:#334155}
.s-loading .icon{background:#EFF6FF;color:#2563EB}
.spin{animation:spin 1s linear infinite;transform-origin:center}
@keyframes spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.spin{animation:none}}
`;

// Static, trusted markup only. No server data ever reaches innerHTML.
const ICONS: Record<string, string> = {
  valid: '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
  revoked: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
  invalid: '<path d="M12 6v8M12 17.5v.5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
  expired: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8v4.5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  'not-found': '<circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15 15l5 5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
  'rate-limited': '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8v4.5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  error: '<path d="M12 6v8M12 17.5v.5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
  loading: '<g class="spin"><path d="M12 4a8 8 0 1 1-8 8" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></g>',
};

type UiState = VerifyResult['status'] | 'loading';

const HEADLINE: Record<UiState, [keyof Strings, keyof Strings | null]> = {
  loading: ['loading', null],
  valid: ['valid', 'validHint'],
  revoked: ['revoked', 'revokedHint'],
  expired: ['expired', 'expiredHint'],
  invalid: ['invalid', 'invalidHint'],
  'not-found': ['notFound', 'notFoundHint'],
  'rate-limited': ['rateLimited', null],
  error: ['error', 'errorHint'],
};

// Lets the module load in Node / SSR without a DOM; the class is only usable in a browser.
const Base: typeof HTMLElement =
  typeof HTMLElement !== 'undefined' ? HTMLElement : (class {} as unknown as typeof HTMLElement);

export class TkawenVerifyElement extends Base {
  static get observedAttributes(): string[] {
    return ['code', 'provider', 'academy', 'lang', 'base-url', 'certify-endpoint'];
  }

  /** Optional fetch override (tests, proxies). */
  fetchImpl?: FetchLike;
  /** Last result, if any. */
  result?: VerifyResult;

  #root: ShadowRoot;
  #out!: HTMLDivElement;
  #input?: HTMLInputElement;
  #button?: HTMLButtonElement;
  #controller?: AbortController;
  #seq = 0;
  #scheduled = false;
  #connected = false;
  #state: UiState | null = null;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.#connected = true;
    this.#build();
    if (this.getAttribute('code')) this.#schedule();
  }

  disconnectedCallback(): void {
    this.#connected = false;
    this.#controller?.abort();
  }

  attributeChangedCallback(name: string, oldV: string | null, newV: string | null): void {
    if (!this.#connected || oldV === newV) return;
    if (name === 'lang') {
      this.#build();
      if (this.result) this.#render(this.result);
      return;
    }
    if (this.getAttribute('code')) this.#schedule();
  }

  /** Run a verification now. Uses the `code` attribute when no code is given. */
  async verify(code?: string): Promise<VerifyResult> {
    const c = (code ?? this.getAttribute('code') ?? this.#input?.value ?? '').trim();
    const seq = ++this.#seq;
    this.#controller?.abort();
    const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
    this.#controller = controller;

    this.#renderLoading();
    const result = await verifyCertificate({
      code: c,
      provider: this.#provider(),
      academy: this.getAttribute('academy') ?? undefined,
      baseUrl: this.getAttribute('base-url') ?? undefined,
      certifyEndpoint: (this.getAttribute('certify-endpoint') as CertifyEndpoint | null) ?? undefined,
      fetch: this.fetchImpl,
      signal: controller?.signal,
    });
    if (seq === this.#seq) {
      this.result = result;
      this.#render(result);
      this.dispatchEvent(new CustomEvent(RESULT_EVENT, { detail: result, bubbles: true, composed: true }));
    }
    return result;
  }

  // ── internals ──────────────────────────────────────────────────────────────

  #provider(): Provider {
    return this.getAttribute('provider') === 'certify' ? 'certify' : 'academy';
  }

  #lang(): Lang {
    const own = this.getAttribute('lang');
    if (own) return pickLang(own);
    const inherited = this.parentElement?.closest?.('[lang]')?.getAttribute('lang');
    return pickLang(inherited ?? (typeof document !== 'undefined' ? document.documentElement.lang : 'en'));
  }

  #t(): Strings {
    return STRINGS[this.#lang()];
  }

  #schedule(): void {
    if (this.#scheduled) return;
    this.#scheduled = true;
    queueMicrotask(() => {
      this.#scheduled = false;
      if (this.#connected && this.getAttribute('code')) void this.verify();
    });
  }

  #build(): void {
    const t = this.#t();
    const lang = this.#lang();
    const doc = this.#root.ownerDocument ?? document;
    const keepValue = this.#input?.value ?? '';

    this.#root.replaceChildren();
    const style = doc.createElement('style');
    style.textContent = STYLE;

    const card = doc.createElement('div');
    card.className = 'card';
    card.setAttribute('part', 'card');
    card.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    card.setAttribute('lang', lang);

    this.#input = undefined;
    this.#button = undefined;
    if (!this.hasAttribute('code')) {
      const title = doc.createElement('p');
      title.className = 'title';
      title.textContent = t.title;

      const form = doc.createElement('form');
      form.setAttribute('part', 'form');
      form.noValidate = true;
      const label = doc.createElement('label');
      label.htmlFor = 'tkv-code';
      label.textContent = t.label;
      const row = doc.createElement('div');
      row.className = 'row';
      const input = doc.createElement('input');
      input.id = 'tkv-code';
      input.type = 'text';
      input.name = 'code';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.maxLength = 128;
      input.required = true;
      input.placeholder = t.placeholder;
      input.setAttribute('autocapitalize', 'characters');
      input.setAttribute('inputmode', 'text');
      input.setAttribute('part', 'input');
      input.value = keepValue;
      const button = doc.createElement('button');
      button.type = 'submit';
      button.textContent = t.submit;
      button.setAttribute('part', 'button');
      row.append(input, button);
      form.append(label, row);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = input.value.trim();
        if (!v) {
          input.focus();
          return;
        }
        void this.verify(v);
      });
      card.append(title, form);
      this.#input = input;
      this.#button = button;
    }

    const out = doc.createElement('div');
    out.className = 'out';
    out.setAttribute('role', 'status');
    out.setAttribute('aria-live', 'polite');
    out.setAttribute('aria-atomic', 'true');
    out.setAttribute('part', 'result');
    card.append(out);
    this.#out = out;
    this.#root.append(style, card);
  }

  #renderLoading(): void {
    this.#setState('loading');
    this.#out.setAttribute('aria-busy', 'true');
    if (this.#button) this.#button.disabled = true;
    this.#out.replaceChildren(this.#stateBlock('loading', this.#t().loading, null));
  }

  #render(r: VerifyResult): void {
    const t = this.#t();
    const lang = this.#lang();
    this.#setState(r.status);
    this.#out.removeAttribute('aria-busy');
    if (this.#button) this.#button.disabled = false;

    const [h, hint] = HEADLINE[r.status];
    const hintText = r.status === 'rate-limited' ? t.rateLimitedHint(r.retryAfter) : hint ? (t[hint] as string) : null;
    const nodes: Node[] = [this.#stateBlock(r.status, t[h] as string, hintText)];

    const doc = this.#root.ownerDocument ?? document;
    const showFacts = r.status === 'valid' || r.status === 'revoked' || r.status === 'expired' || r.status === 'invalid';
    if (showFacts) {
      const dl = doc.createElement('dl');
      const add = (k: string, v: string | undefined, cls?: string) => {
        if (!v) return;
        const dt = doc.createElement('dt');
        dt.textContent = k;
        const dd = doc.createElement('dd');
        dd.textContent = v;
        if (cls) dd.className = cls;
        dl.append(dt, dd);
      };
      add(t.holder, r.holderName);
      add(t.course, r.courseName);
      add(t.issuer, r.issuer.name);
      add(t.issued, formatDate(r.issuedAt, lang));
      add(t.expires, formatDate(r.expiresAt, lang));
      add(t.code, r.code, 'code');
      if (dl.childNodes.length) nodes.push(dl);
    }

    const foot = doc.createElement('p');
    foot.className = 'foot';
    if (r.verifyUrl && /^https?:\/\//.test(r.verifyUrl) && r.status !== 'rate-limited') {
      const a = doc.createElement('a');
      a.href = r.verifyUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = t.openPage;
      a.setAttribute('part', 'link');
      foot.append(a);
    }
    const brand = doc.createElement('span');
    brand.className = 'brand';
    brand.textContent = t.poweredBy;
    foot.append(brand);
    nodes.push(foot);

    this.#out.replaceChildren(...nodes);
  }

  #setState(s: UiState): void {
    this.#state = s;
    this.setAttribute('state', s);
  }

  get state(): UiState | null {
    return this.#state;
  }

  #stateBlock(status: UiState, headline: string, hint: string | null): HTMLElement {
    const doc = this.#root.ownerDocument ?? document;
    const wrap = doc.createElement('div');
    wrap.className = `state s-${status}`;
    wrap.setAttribute('data-state', status);
    const icon = doc.createElement('span');
    icon.className = 'icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = `<svg viewBox="0 0 24 24" focusable="false">${ICONS[status] ?? ''}</svg>`;
    const text = doc.createElement('div');
    const p = doc.createElement('p');
    p.className = 'headline';
    p.textContent = headline;
    text.append(p);
    if (hint) {
      const hp = doc.createElement('p');
      hp.className = 'hint';
      hp.textContent = hint;
      text.append(hp);
    }
    wrap.append(icon, text);
    return wrap;
  }
}

/** Register <tkawen-verify>. Safe to call more than once and a no-op without a DOM. */
export function defineTkawenVerify(tagName: string = TAG_NAME): void {
  if (typeof customElements === 'undefined') return;
  if (!customElements.get(tagName)) customElements.define(tagName, TkawenVerifyElement);
}

declare global {
  interface HTMLElementTagNameMap {
    'tkawen-verify': TkawenVerifyElement;
  }
}

// Importing this module registers the element (browser only).
defineTkawenVerify();
