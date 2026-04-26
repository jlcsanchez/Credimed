/* =========================================================================
   Credimed agent chat widget — DEPRECATED
   ----------------------------------------
   Superseded by /app/ana.js, which is the single chat persona used
   across the entire Credimed app. This file is kept for one release
   cycle in case a page reference was missed; it will be removed once
   we've confirmed nothing in production loads it.
   ========================================================================= */

(function () {
  'use strict';

  const ENDPOINT = null;  // Removed: chat is FAQ-driven, no LLM round-trip.

  const SUPPORT_EMAIL = 'support@credimed.us';

  const AGENT_META = {
    sofia: { name: 'Sofia', accent: '#0D9488', opener: "Hi 👋 I'm Sofia. Want to see if your US PPO insurance owes you money for dental work in Mexico? Tap a question or type your own." },
    ana:   { name: 'Ana',   accent: '#0D9488', opener: "Hi 👋 I'm Ana. Here are the most common questions while you upload your documents." },
    elena: { name: 'Elena', accent: '#0D9488', opener: "Hi 👋 I'm Elena. These are the most common questions about plans and pricing." },
    marco: { name: 'Marco', accent: '#0D9488', opener: "Hi 👋 I'm Marco. Here are the most common questions about your claim status. For case-specific details I'll connect you with a human by email." },
  };

  /**
   * Normalize a string for keyword matching: lowercase, strip accents,
   * collapse whitespace. Mirror this logic exactly when adding entries
   * to faq-data.js — keywords are matched against the normalized form.
   */
  function normalize(s) {
    return (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Heuristic language detector. Defaults to English (the personas
   * open in English) and flips to Spanish only when the message has
   * clear Spanish function words AND lacks English ones. Keeps the
   * door open for bilingual support later without forcing it now.
   */
  function detectLang(text) {
    const t = normalize(text);
    if (!t) return 'en';
    const en = /\b(the|is|are|how|what|when|where|why|do|does|can|i|you|we|my|your)\b/g;
    const es = /\b(el|la|los|las|que|como|cuando|donde|porque|cuanto|tu|mi|hola|gracias|si)\b/g;
    const enHits = (t.match(en) || []).length;
    const esHits = (t.match(es) || []).length;
    if (esHits >= 2 && enHits === 0) return 'es';
    return 'en';
  }

  /**
   * Score every FAQ entry against the query and return the best
   * match (or null if no entry scores >= MIN_SCORE).
   */
  function matchFAQ(query, catalog) {
    if (!catalog || catalog.length === 0) return null;
    const q = normalize(query);
    if (!q) return null;
    const tokens = q.split(' ').filter(Boolean);
    const MIN_SCORE = 1;
    let best = null;
    let bestScore = 0;
    for (const entry of catalog) {
      let score = 0;
      // Keyword hits (1 point each, capped to avoid spam-keyword stuffing)
      for (const kw of (entry.keywords || [])) {
        const k = normalize(kw);
        if (!k) continue;
        if (q.indexOf(k) !== -1) score += 1;
      }
      // Strong bonus if a significant token of the question itself
      // shows up: catches cases where keywords are missing but the
      // user phrased close to the canonical question.
      const qEs = normalize(entry.q_es);
      const qEn = normalize(entry.q_en);
      for (const tok of tokens) {
        if (tok.length < 4) continue;
        if (qEs.indexOf(tok) !== -1 || qEn.indexOf(tok) !== -1) score += 0.5;
      }
      if (score > bestScore) { bestScore = score; best = entry; }
    }
    return bestScore >= MIN_SCORE ? best : null;
  }

  const SCROLLBAR_CSS = '::-webkit-scrollbar{width:6px}::-webkit-scrollbar-thumb{background:rgba(15,23,42,.15);border-radius:6px}';

  function injectStyles() {
    if (document.getElementById('credimed-agent-styles')) return;
    const s = document.createElement('style');
    s.id = 'credimed-agent-styles';
    s.textContent = `
      .cac-bubble{position:fixed;bottom:20px;right:20px;z-index:9998;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#0D9488,#0A7A70);color:#fff;border:0;cursor:pointer;box-shadow:0 10px 30px -6px rgba(13,148,136,.5),0 4px 12px rgba(15,23,42,.1);display:flex;align-items:center;justify-content:center;transition:transform .18s cubic-bezier(.2,.8,.2,1)}
      .cac-bubble:hover{transform:scale(1.05)}
      .cac-bubble:active{transform:scale(.96)}
      .cac-bubble svg{width:24px;height:24px}
      .cac-bubble-dot{position:absolute;top:10px;right:10px;width:10px;height:10px;border-radius:50%;background:#5EEAD4;border:2px solid #fff}
      .cac-panel{position:fixed;bottom:20px;right:20px;z-index:9999;width:360px;max-width:calc(100vw - 32px);height:540px;max-height:calc(100vh - 48px);background:#fff;border-radius:20px;box-shadow:0 20px 60px -10px rgba(15,23,42,.24),0 8px 24px rgba(15,23,42,.1);display:flex;flex-direction:column;overflow:hidden;transform-origin:bottom right;animation:cac-in .22s cubic-bezier(.2,.8,.2,1)}
      @keyframes cac-in{from{transform:translateY(20px) scale(.96);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}
      .cac-head{background:linear-gradient(135deg,#0f172a,#134e4a);color:#fff;padding:16px 18px;display:flex;align-items:center;gap:12px;flex-shrink:0}
      .cac-avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#0D9488,#5EEAD4);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px}
      .cac-head .cac-name{font-weight:700;font-size:15px;letter-spacing:-.01em}
      .cac-head .cac-role{font-size:11px;opacity:.7;letter-spacing:.06em;text-transform:uppercase;margin-top:1px}
      .cac-close{margin-left:auto;background:transparent;border:0;color:rgba(255,255,255,.75);cursor:pointer;padding:6px;border-radius:6px;display:flex}
      .cac-close:hover{background:rgba(255,255,255,.1);color:#fff}
      .cac-body{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;background:#FAF6EF}
      .cac-body${SCROLLBAR_CSS.replace(/::/g, ' ::')}
      .cac-msg{max-width:80%;padding:10px 14px;border-radius:16px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}
      .cac-msg.user{align-self:flex-end;background:#0D9488;color:#fff;border-bottom-right-radius:4px}
      .cac-msg.assistant{align-self:flex-start;background:#fff;color:#0F172A;border:1px solid rgba(15,23,42,.08);border-bottom-left-radius:4px}
      .cac-msg.assistant b{color:#0A7A70}
      .cac-typing{align-self:flex-start;display:flex;gap:4px;padding:14px 16px;background:#fff;border:1px solid rgba(15,23,42,.08);border-radius:16px;border-bottom-left-radius:4px}
      .cac-typing span{width:7px;height:7px;border-radius:50%;background:#94A3B8;animation:cac-bounce 1.2s infinite ease-in-out}
      .cac-typing span:nth-child(2){animation-delay:.15s}
      .cac-typing span:nth-child(3){animation-delay:.3s}
      @keyframes cac-bounce{0%,100%{transform:translateY(0);opacity:.4}40%{transform:translateY(-4px);opacity:1}}
      .cac-input{display:flex;gap:8px;padding:12px;background:#fff;border-top:1px solid rgba(15,23,42,.08);flex-shrink:0}
      .cac-input textarea{flex:1;border:1px solid #E2E8F0;border-radius:12px;padding:10px 12px;font-family:inherit;font-size:14px;resize:none;outline:none;min-height:40px;max-height:120px;line-height:1.4}
      .cac-input textarea:focus{border-color:#0D9488;box-shadow:0 0 0 3px rgba(13,148,136,.15)}
      .cac-send{width:40px;height:40px;border:0;border-radius:50%;background:#0D9488;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s}
      .cac-send:hover{background:#0A7A70}
      .cac-send:disabled{background:#CBD5E1;cursor:not-allowed}
      .cac-send svg{width:16px;height:16px}
      .cac-foot{padding:8px 12px;text-align:center;font-size:10.5px;color:#94A3B8;background:#fff;border-top:1px solid rgba(15,23,42,.04);flex-shrink:0}
      .cac-foot a{color:#64748B;text-decoration:none}
      .cac-foot a:hover{text-decoration:underline}
      .cac-quick-replies{display:flex;flex-direction:column;gap:6px;margin-top:4px;align-self:stretch}
      .cac-qr-btn{text-align:left;background:#fff;color:#0F172A;border:1px solid rgba(13,148,136,.25);border-radius:14px;padding:10px 14px;font-family:inherit;font-size:13px;line-height:1.35;cursor:pointer;transition:background .14s,border-color .14s}
      .cac-qr-btn:hover{background:#F0FDFA;border-color:#0D9488}
      .cac-qr-btn:active{background:#CCFBF1}
      .cac-email-btn{align-self:flex-start;display:inline-flex;align-items:center;gap:6px;background:#0D9488;color:#fff;border-radius:14px;padding:10px 14px;font-size:13px;font-weight:600;text-decoration:none;margin-top:4px}
      .cac-email-btn:hover{background:#0A7A70}
      @media (max-width:520px){
        /* iOS Safari note: 100vh INCLUDES the URL bar area, so a panel sized
           with height:100vh would have its top (header with close button)
           rendered behind the chrome. Use 100dvh (dynamic viewport, modern
           browsers) and fall back to absolute top/bottom on older Safari.
           Also reserve env(safe-area-inset-top) so the header is fully
           visible when the URL bar shrinks during scroll. */
        .cac-panel{
          top:0; bottom:0; right:0; left:0;
          width:100%; max-width:100%;
          height:100dvh; max-height:100dvh;
          border-radius:0;
          animation:cac-in-mobile .22s cubic-bezier(.2,.8,.2,1);
          padding-top:env(safe-area-inset-top);
          padding-bottom:env(safe-area-inset-bottom);
        }
        @keyframes cac-in-mobile{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}
      }
    `.replace(/\n\s+/g, '\n');
    document.head.appendChild(s);
  }

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') el.className = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (v != null) el.setAttribute(k, v);
    }
    for (const c of children) {
      if (c == null) continue;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  }

  function roleLabel(agent) {
    return {
      sofia: 'Sales assistant',
      ana:   'Onboarding specialist',
      elena: 'Pricing advisor',
      marco: 'Case manager',
    }[agent] || '';
  }

  function renderMarkdownLite(text) {
    // Minimal: **bold** → <b>, newlines → <br>. XSS-safe because we escape first.
    const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return esc.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  }

  class AgentChat {
    constructor(opts) {
      this.agent = opts.agent || 'ana';
      this.context = opts.context || null;
      this.meta = AGENT_META[this.agent] || AGENT_META.ana;
      this.messages = [];  // [{ role, content }]
      this.isOpen = false;
      this.isSending = false;
      this.storageKey = `credimed_chat_${this.agent}`;
      this._loadHistory();
      this._mount();
    }

    _loadHistory() {
      try {
        const saved = localStorage.getItem(this.storageKey);
        if (saved) this.messages = JSON.parse(saved);
      } catch {}
    }

    _saveHistory() {
      try { localStorage.setItem(this.storageKey, JSON.stringify(this.messages.slice(-30))); } catch {}
    }

    _mount() {
      injectStyles();
      const bubble = h('button', { class: 'cac-bubble', 'aria-label': `Open chat with ${this.meta.name}`, onclick: () => this.toggle() },
        h('div', { class: 'cac-bubble-dot' }),
        this._chatIcon()
      );
      document.body.appendChild(bubble);
      this.bubble = bubble;
    }

    _chatIcon() {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z');
      svg.appendChild(path);
      return svg;
    }

    toggle() { this.isOpen ? this.close() : this.open(); }

    open() {
      if (this.isOpen) return;
      this.isOpen = true;
      this.bubble.style.display = 'none';
      this._buildPanel();
      if (this.messages.length === 0) {
        this._addMessage('assistant', this.meta.opener, false);
        this._renderQuickReplies(4);
      }
      this._scrollToBottom();
      setTimeout(() => this.textarea?.focus(), 50);
    }

    close() {
      this.isOpen = false;
      if (this.panel) { this.panel.remove(); this.panel = null; }
      this.bubble.style.display = 'flex';
    }

    _buildPanel() {
      const head = h('div', { class: 'cac-head' },
        h('div', { class: 'cac-avatar' }, this.meta.name[0]),
        h('div', {},
          h('div', { class: 'cac-name' }, this.meta.name),
          h('div', { class: 'cac-role' }, roleLabel(this.agent))
        ),
        h('button', { class: 'cac-close', 'aria-label': 'Close', onclick: () => this.close() }, this._xIcon())
      );
      const body = h('div', { class: 'cac-body' });
      const textarea = h('textarea', { placeholder: 'Type a message…', rows: '1' });
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._send(); }
      });
      textarea.addEventListener('input', () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
      });
      const send = h('button', { class: 'cac-send', 'aria-label': 'Send', onclick: () => this._send() }, this._sendIcon());
      const input = h('div', { class: 'cac-input' }, textarea, send);
      const foot = h('div', { class: 'cac-foot' }, 'For specific case questions · ', h('a', { href: 'mailto:' + SUPPORT_EMAIL }, 'email a human'));
      const panel = h('div', { class: 'cac-panel', role: 'dialog', 'aria-label': `Chat with ${this.meta.name}` }, head, body, input, foot);
      document.body.appendChild(panel);
      this.panel = panel; this.body = body; this.textarea = textarea; this.sendBtn = send;
      // Re-render existing messages
      for (const m of this.messages) this._renderMessage(m);
    }

    /**
     * Render up-to-N quick-reply buttons in the chat body. Clicking
     * one is equivalent to typing that question — same FAQ flow,
     * just no typing required. Renders below the most recent assistant
     * message, never above the user's history.
     */
    _renderQuickReplies(limit) {
      if (!this.body) return;
      const catalog = (window.CredimedFAQ && window.CredimedFAQ[this.agent]) || [];
      if (catalog.length === 0) return;
      const container = h('div', { class: 'cac-quick-replies' });
      const lang = this.lang || 'en';
      const slice = catalog.slice(0, limit || 4);
      for (const entry of slice) {
        const label = lang === 'en' ? entry.q_en : entry.q_es;
        const btn = h('button', {
          class: 'cac-qr-btn',
          type: 'button',
          onclick: () => this._answerEntry(entry, label)
        }, label);
        container.appendChild(btn);
      }
      this.body.appendChild(container);
      this._scrollToBottom();
    }

    _clearQuickReplies() {
      if (!this.body) return;
      const existing = this.body.querySelectorAll('.cac-quick-replies');
      existing.forEach((el) => el.remove());
    }

    /**
     * Render an answer card and a follow-up "What else can I ask?"
     * row of quick replies so the conversation can keep flowing.
     */
    _answerEntry(entry, userText) {
      this._clearQuickReplies();
      this._addMessage('user', userText);
      const lang = this.lang || 'en';
      const reply = lang === 'en' ? entry.a_en : entry.a_es;
      this._addMessage('assistant', reply);
      this.unmatchedCount = 0;
      this._renderQuickReplies(4);
    }

    /**
     * No FAQ matched. Surface the email-escalation card as a real chat
     * bubble plus a button. After two unmatched attempts in a row,
     * we make the email path the headline.
     */
    _renderEscalation(prominent) {
      const lang = this.lang || 'en';
      const msg = prominent
        ? (lang === 'en'
            ? "I can only answer common questions here. For your specific case, please email a human at " + SUPPORT_EMAIL + " — we reply within one business day."
            : 'Aquí solo respondo preguntas comunes. Para tu caso específico, por favor escríbele a un humano a ' + SUPPORT_EMAIL + ' — respondemos en menos de un día hábil.')
        : (lang === 'en'
            ? "I don't have a canned answer for that. You can email " + SUPPORT_EMAIL + " for a human, or try one of the questions below."
            : 'No tengo una respuesta para eso. Puedes escribir a ' + SUPPORT_EMAIL + ' para hablar con un humano, o prueba con una de las preguntas de abajo.');
      this._addMessage('assistant', msg);
      this._renderEmailButton();
      this._renderQuickReplies(4);
    }

    _renderEmailButton() {
      if (!this.body) return;
      const lang = this.lang || 'en';
      const subject = encodeURIComponent('Pregunta para Credimed (' + this.agent + ')');
      const ctxLine = this.context && this.context.claimId ? '%0A%0AClaim ID: ' + encodeURIComponent(this.context.claimId) : '';
      const body = encodeURIComponent('Hola,%0A%0A') + ctxLine;
      const href = 'mailto:' + SUPPORT_EMAIL + '?subject=' + subject + '&body=' + body;
      const btn = h('a', {
        class: 'cac-email-btn',
        href,
        target: '_blank',
        rel: 'noopener'
      }, lang === 'en' ? '✉ Email a human' : '✉ Escribirle a un humano');
      this.body.appendChild(btn);
      this._scrollToBottom();
    }

    _xIcon() {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '20'); svg.setAttribute('height', '20'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2'); svg.setAttribute('stroke-linecap', 'round');
      const l1 = document.createElementNS('http://www.w3.org/2000/svg', 'line'); l1.setAttribute('x1', '18'); l1.setAttribute('y1', '6'); l1.setAttribute('x2', '6'); l1.setAttribute('y2', '18');
      const l2 = document.createElementNS('http://www.w3.org/2000/svg', 'line'); l2.setAttribute('x1', '6'); l2.setAttribute('y1', '6'); l2.setAttribute('x2', '18'); l2.setAttribute('y2', '18');
      svg.appendChild(l1); svg.appendChild(l2);
      return svg;
    }

    _sendIcon() {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2.2'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
      const l = document.createElementNS('http://www.w3.org/2000/svg', 'line'); l.setAttribute('x1', '22'); l.setAttribute('y1', '2'); l.setAttribute('x2', '11'); l.setAttribute('y2', '13');
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'polygon'); p.setAttribute('points', '22 2 15 22 11 13 2 9 22 2');
      svg.appendChild(l); svg.appendChild(p);
      return svg;
    }

    _addMessage(role, content, save = true) {
      const msg = { role, content };
      this.messages.push(msg);
      if (save) this._saveHistory();
      this._renderMessage(msg);
      this._scrollToBottom();
    }

    _renderMessage(msg) {
      if (!this.body) return;
      const el = h('div', { class: `cac-msg ${msg.role}` });
      el.innerHTML = renderMarkdownLite(msg.content);
      this.body.appendChild(el);
    }

    _showTyping() {
      if (!this.body) return;
      const t = h('div', { class: 'cac-typing' }, h('span'), h('span'), h('span'));
      t.id = 'cac-typing-indicator';
      this.body.appendChild(t);
      this._scrollToBottom();
    }

    _hideTyping() {
      const t = document.getElementById('cac-typing-indicator');
      if (t) t.remove();
    }

    _scrollToBottom() {
      if (this.body) this.body.scrollTop = this.body.scrollHeight;
    }

    /**
     * FAQ-driven response. No network call. Steps:
     *   1. Detect language on the user's first typed message and lock it.
     *   2. Score the catalog for the active persona; if a match wins,
     *      render its answer.
     *   3. If nothing scores, increment unmatchedCount. First miss is
     *      a soft "try one of these" with quick replies; second miss
     *      becomes the prominent email-escalation card.
     */
    _send() {
      if (this.isSending) return;
      const text = this.textarea.value.trim();
      if (!text) return;
      this.textarea.value = '';
      this.textarea.style.height = 'auto';

      // Lock language to the first non-trivial typed message.
      if (!this.lang || this.lang === 'auto') {
        this.lang = detectLang(text);
      }

      this._clearQuickReplies();
      this._addMessage('user', text);

      this.isSending = true;
      this.sendBtn.disabled = true;
      this._showTyping();

      // Tiny delay so the typing indicator reads as "thinking" rather
      // than being instant. Keeps the conversational feel without a
      // real round-trip.
      setTimeout(() => {
        this._hideTyping();

        const catalog = (window.CredimedFAQ && window.CredimedFAQ[this.agent]) || [];
        const match = matchFAQ(text, catalog);

        if (match) {
          const reply = this.lang === 'en' ? match.a_en : match.a_es;
          this._addMessage('assistant', reply);
          this.unmatchedCount = 0;
          this._renderQuickReplies(4);
        } else {
          this.unmatchedCount = (this.unmatchedCount || 0) + 1;
          this._renderEscalation(this.unmatchedCount >= 2);
        }

        this.isSending = false;
        this.sendBtn.disabled = false;
        this.textarea.focus();
      }, 240);
    }
  }

  window.CredimedAgentChat = {
    init(opts) {
      if (window._credimedAgentChat) return window._credimedAgentChat;
      window._credimedAgentChat = new AgentChat(opts || {});
      return window._credimedAgentChat;
    },
  };

  // Auto-init if loaded with data-agent on the script tag
  const currentScript = document.currentScript;
  if (currentScript) {
    const agent = currentScript.getAttribute('data-agent');
    if (agent) {
      let context = null;
      const ctxAttr = currentScript.getAttribute('data-context');
      if (ctxAttr) { try { context = JSON.parse(ctxAttr); } catch {} }
      window.CredimedAgentChat.init({ agent, context });
    }
  }
})();
