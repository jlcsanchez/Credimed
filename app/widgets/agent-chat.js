/* =========================================================================
   Credimed agent chat widget
   Drop-in floating chat bubble that talks to the credimed-agents Lambda.

   Usage:
     <script src="widgets/agent-chat.js"
             data-agent="ana"
             data-context='{"claimId":"CMX-...","claimStatus":"submitted"}'></script>

     Or init manually:
       CredimedAgentChat.init({ agent: 'marco', context: {...} });

   Agent values: sofia | ana | elena | marco
   Context is optional. If present, it is passed through to the Lambda so
   the prompt can personalize replies.
   ========================================================================= */

(function () {
  'use strict';

  const ENDPOINT = (window.CREDIMED_API || 'https://0xosu4ifj5.execute-api.us-west-2.amazonaws.com') + '/agents';

  const AGENT_META = {
    sofia: { name: 'Sofia', accent: '#0D9488', opener: 'Hola 👋 soy Sofia. ¿Te ayudo a ver si tu seguro PPO te debe dinero por trabajo dental en México?' },
    ana:   { name: 'Ana',   accent: '#0D9488', opener: 'Hola 👋 soy Ana. ¿Te ayudo con algo mientras subes tus documentos o revisas tu estimado?' },
    elena: { name: 'Elena', accent: '#0D9488', opener: 'Hola 👋 soy Elena. Si tienes dudas del plan que te tocó o qué incluye el fee, pregúntame.' },
    marco: { name: 'Marco', accent: '#0D9488', opener: 'Hola 👋 soy Marco. Tu claim está en camino — si tienes alguna duda, pregúntame.' },
  };

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
      if (this.messages.length === 0) this._addMessage('assistant', this.meta.opener, false);
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
      const textarea = h('textarea', { placeholder: 'Escribe un mensaje…', rows: '1' });
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._send(); }
      });
      textarea.addEventListener('input', () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
      });
      const send = h('button', { class: 'cac-send', 'aria-label': 'Send', onclick: () => this._send() }, this._sendIcon());
      const input = h('div', { class: 'cac-input' }, textarea, send);
      const foot = h('div', { class: 'cac-foot' }, `${this.meta.name} is an AI assistant powered by Claude · `, h('a', { href: 'mailto:support@credimed.us' }, 'talk to a human'));
      const panel = h('div', { class: 'cac-panel', role: 'dialog', 'aria-label': `Chat with ${this.meta.name}` }, head, body, input, foot);
      document.body.appendChild(panel);
      this.panel = panel; this.body = body; this.textarea = textarea; this.sendBtn = send;
      // Re-render existing messages
      for (const m of this.messages) this._renderMessage(m);
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

    async _send() {
      if (this.isSending) return;
      const text = this.textarea.value.trim();
      if (!text) return;
      this.textarea.value = '';
      this.textarea.style.height = 'auto';
      this._addMessage('user', text);
      this.isSending = true;
      this.sendBtn.disabled = true;
      this._showTyping();

      try {
        // JWT for logged-in agents (ana/elena/marco)
        let token = null;
        if (this.agent !== 'sofia' && window.cognitoGetIdToken) {
          try { token = await window.cognitoGetIdToken(); } catch {}
        }
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = 'Bearer ' + token;

        const body = {
          agent: this.agent,
          messages: this.messages.map((m) => ({ role: m.role, content: m.content })),
          context: this.context,
        };

        const resp = await fetch(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(body) });
        const data = await resp.json();
        this._hideTyping();

        if (!resp.ok) {
          const msg = data?.error || `Error ${resp.status}. Intenta de nuevo.`;
          this._addMessage('assistant', `⚠️ ${msg}`);
          return;
        }
        this._addMessage('assistant', data.reply || '…');
      } catch (err) {
        this._hideTyping();
        this._addMessage('assistant', `⚠️ Tuve un problema conectándome. Revisa tu internet e intenta otra vez — o escríbenos a support@credimed.us.`);
        console.error('[agent-chat]', err);
      } finally {
        this.isSending = false;
        this.sendBtn.disabled = false;
        this.textarea.focus();
      }
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
