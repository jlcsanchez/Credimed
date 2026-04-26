/**
 * Ana — embedded floating chat for the in-app flow pages
 * (login, documents, estimate, before-sign, submission-confirmed).
 *
 * Same FAQ-driven model as agent-chat.js (Sofia on the landing) but
 * with Ana's drawer-style UI rather than a centered panel. Reads
 * window.CredimedFAQ.ana so all canned answers live in one place
 * (faq-data.js) instead of being duplicated here.
 *
 * No LLM. No WhatsApp. Free-text questions that don't match any
 * canned answer surface a mailto:support@credimed.us escalation.
 */
(function () {
  'use strict';

  var SUPPORT_EMAIL = 'support@credimed.us';
  var DEFAULT_LANG = 'en';

  // -------- Helpers (mirror agent-chat.js so behavior is identical) -------

  function normalize(s) {
    return (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function detectLang(text) {
    var t = normalize(text);
    if (!t) return DEFAULT_LANG;
    var en = (t.match(/\b(the|is|are|how|what|when|where|why|do|does|can|i|you|we|my|your)\b/g) || []).length;
    var es = (t.match(/\b(el|la|los|las|que|como|cuando|donde|porque|cuanto|tu|mi|hola|gracias|si)\b/g) || []).length;
    if (es >= 2 && en === 0) return 'es';
    return 'en';
  }

  function matchFAQ(query) {
    var catalog = (window.CredimedFAQ && window.CredimedFAQ.ana) || [];
    if (catalog.length === 0) return null;
    var q = normalize(query);
    if (!q) return null;
    var tokens = q.split(' ').filter(Boolean);
    var best = null, bestScore = 0;
    for (var i = 0; i < catalog.length; i++) {
      var entry = catalog[i];
      var score = 0;
      for (var k = 0; k < (entry.keywords || []).length; k++) {
        var kw = normalize(entry.keywords[k]);
        if (kw && q.indexOf(kw) !== -1) score += 1;
      }
      var qEs = normalize(entry.q_es), qEn = normalize(entry.q_en);
      for (var t = 0; t < tokens.length; t++) {
        var tok = tokens[t];
        if (tok.length < 4) continue;
        if (qEs.indexOf(tok) !== -1 || qEn.indexOf(tok) !== -1) score += 0.5;
      }
      if (score > bestScore) { bestScore = score; best = entry; }
    }
    return bestScore >= 1 ? best : null;
  }

  // -------- DOM helpers --------------------------------------------------

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (k === 'html') e.innerHTML = attrs[k];
        else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        else e.setAttribute(k, attrs[k]);
      }
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null) return;
        e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return e;
  }

  function buildMailto(prefilledQuestion) {
    var subject = 'Question for Credimed (via Ana chat)';
    var body = (prefilledQuestion ? prefilledQuestion + '\n\n' : '') +
               '— sent from credimed.us';
    return 'mailto:' + SUPPORT_EMAIL +
           '?subject=' + encodeURIComponent(subject) +
           '&body=' + encodeURIComponent(body);
  }

  // -------- Styles -------------------------------------------------------

  function injectStyles() {
    if (document.getElementById('ana-styles')) return;
    var style = document.createElement('style');
    style.id = 'ana-styles';
    style.textContent =
      '.ana-fab{position:fixed;right:20px;bottom:20px;z-index:999999;width:56px;height:56px;border-radius:50%;background:#0D9488;color:#fff;border:none;cursor:pointer;box-shadow:0 8px 24px rgba(13,148,136,.35);display:grid;place-items:center;transition:transform 150ms ease,background 150ms;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}' +
      '.ana-fab:hover{background:#0B8278;transform:scale(1.05)}' +
      '.ana-fab svg{width:26px;height:26px}' +
      '.ana-fab-badge{position:absolute;top:4px;right:4px;width:10px;height:10px;border-radius:50%;background:#5EEAD4;box-shadow:0 0 0 2px #0D9488;animation:ana-pulse 2s infinite}' +
      '@keyframes ana-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.3);opacity:.7}}' +
      '.ana-drawer{position:fixed;right:20px;bottom:90px;z-index:999999;width:360px;max-width:calc(100vw - 40px);max-height:520px;min-height:400px;background:#fff;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,.2),0 0 0 1px rgba(15,23,42,.06);display:none;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;overflow:hidden}' +
      '.ana-drawer.open{display:flex;animation:ana-slideup 250ms ease}' +
      '@keyframes ana-slideup{from{transform:translateY(10px);opacity:0}to{transform:translateY(0);opacity:1}}' +
      '.ana-header{padding:16px 18px;background:linear-gradient(135deg,#0D9488 0%,#0A7A70 100%);color:#fff;display:flex;align-items:center;gap:12px}' +
      '.ana-avatar{width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.18);display:grid;place-items:center;font-weight:700;font-size:16px;border:1px solid rgba(255,255,255,.3)}' +
      '.ana-header-text{flex:1;min-width:0}' +
      '.ana-header-text strong{display:block;font-size:15px;font-weight:600}' +
      '.ana-header-text small{font-size:11px;color:rgba(255,255,255,.8);display:flex;align-items:center;gap:4px}' +
      '.ana-header-text small::before{content:"";width:6px;height:6px;border-radius:50%;background:#5EEAD4}' +
      '.ana-close{background:rgba(255,255,255,.12);border:none;color:#fff;width:28px;height:28px;border-radius:50%;cursor:pointer;display:grid;place-items:center}' +
      '.ana-close:hover{background:rgba(255,255,255,.22)}' +
      '.ana-body{flex:1;overflow-y:auto;padding:16px;background:#f8fafc;display:flex;flex-direction:column;gap:10px}' +
      '.ana-msg{max-width:85%;padding:10px 14px;border-radius:14px;font-size:13.5px;line-height:1.45;color:#1e293b;white-space:pre-wrap;word-wrap:break-word}' +
      '.ana-msg.ana-from{background:#fff;border:1px solid #e2e8f0;border-bottom-left-radius:4px;align-self:flex-start}' +
      '.ana-msg.user-from{background:#0D9488;color:#fff;border-bottom-right-radius:4px;align-self:flex-end}' +
      '.ana-email-cta{align-self:flex-start;display:inline-flex;align-items:center;gap:6px;background:#0D9488;color:#fff;border-radius:12px;padding:9px 14px;font-size:13px;font-weight:600;text-decoration:none}' +
      '.ana-email-cta:hover{background:#0A7A70}' +
      '.ana-chips{padding:10px 14px;display:flex;flex-wrap:wrap;gap:6px;background:#fff;border-top:1px solid #e2e8f0}' +
      '.ana-chip{background:#f0fdfa;color:#0B8278;border:1px solid #99f6e4;padding:6px 12px;border-radius:999px;font-size:12px;cursor:pointer;font-family:inherit;text-align:left}' +
      '.ana-chip:hover{background:#ccfbf1}' +
      '.ana-input-row{padding:10px 12px;background:#fff;border-top:1px solid #e2e8f0;display:flex;gap:8px;align-items:center}' +
      '.ana-input{flex:1;border:1px solid #e2e8f0;border-radius:999px;padding:9px 14px;font-size:13px;outline:none;font-family:inherit;color:#1e293b}' +
      '.ana-input:focus{border-color:#0D9488;box-shadow:0 0 0 3px rgba(13,148,136,.15)}' +
      '.ana-send{background:#0D9488;color:#fff;border:none;width:36px;height:36px;border-radius:50%;cursor:pointer;display:grid;place-items:center;flex-shrink:0}' +
      '.ana-send:hover{background:#0B8278}' +
      '.ana-footer-link{text-align:center;padding:6px;font-size:10.5px;color:#94a3b8;background:#fff}' +
      '@media (max-width:480px){.ana-drawer{right:10px;left:10px;width:auto;bottom:78px}.ana-fab{right:16px;bottom:16px}}';
    document.head.appendChild(style);
  }

  // -------- Widget -------------------------------------------------------

  function buildWidget() {
    if (document.querySelector('.ana-fab')) return;
    injectStyles();

    var lang = DEFAULT_LANG;       // locks to user's first typed message
    var unmatched = 0;             // grows on each free-text miss

    var fab = el('button', {
      class: 'ana-fab', type: 'button', 'aria-label': 'Chat with Ana',
      html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
    });
    fab.appendChild(el('span', { class: 'ana-fab-badge' }));

    var drawer = el('div', { class: 'ana-drawer', role: 'dialog', 'aria-label': 'Chat with Ana' });

    var closeBtn = el('button', {
      class: 'ana-close', type: 'button', 'aria-label': 'Close',
      html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
      onClick: function () { drawer.classList.remove('open'); }
    });
    var header = el('div', { class: 'ana-header' }, [
      el('div', { class: 'ana-avatar' }, 'A'),
      el('div', { class: 'ana-header-text' }, [
        el('strong', {}, 'Ana'),
        el('small', {}, 'Online · Usually replies quickly')
      ]),
      closeBtn
    ]);

    var body = el('div', { class: 'ana-body' }, [
      el('div', { class: 'ana-msg ana-from' }, "Hi, I'm Ana Lucía — I'll help you recover your refund."),
      el('div', { class: 'ana-msg ana-from' }, "Tap a question or type your own.")
    ]);

    function addMsg(role, text) {
      var msg = el('div', { class: 'ana-msg ' + (role === 'user' ? 'user-from' : 'ana-from') }, text);
      body.appendChild(msg);
      body.scrollTop = body.scrollHeight;
    }

    function addEmailCta(prefill) {
      var a = el('a', {
        class: 'ana-email-cta',
        href: buildMailto(prefill || ''),
        target: '_blank', rel: 'noopener'
      }, '✉ Email a human');
      body.appendChild(a);
      body.scrollTop = body.scrollHeight;
    }

    /**
     * The single entry point. Every quick-reply click and every typed
     * Enter routes through here. Order:
     *   1. Echo the user's question into the transcript.
     *   2. If a FAQ entry scores, show its answer in Ana's voice.
     *   3. Otherwise increment unmatched and surface the email path.
     *      First miss is soft ("try a different phrasing or email…");
     *      second miss is loud (email card on its own line).
     */
    function respond(question) {
      var text = (question || '').trim();
      if (!text) return;
      addMsg('user', text);
      lang = detectLang(text);
      var match = matchFAQ(text);
      if (match) {
        addMsg('ana', lang === 'es' ? match.a_es : match.a_en);
        unmatched = 0;
        return;
      }
      unmatched++;
      var soft = lang === 'es'
        ? "No tengo una respuesta exacta para eso. Puedes reformular o escribir a un humano por correo."
        : "I don't have an exact answer for that. Try rephrasing or email a human.";
      var loud = lang === 'es'
        ? "Para tu caso específico, lo mejor es escribir a un humano. Te respondemos en menos de un día hábil."
        : "For your specific case, the best path is to email a human. We reply within one business day.";
      addMsg('ana', unmatched >= 2 ? loud : soft);
      addEmailCta(text);
    }

    // Quick-reply chips. The first three pull straight from the FAQ
    // catalog so they always match. The fourth is an explicit
    // "talk to human" button that skips the FAQ and opens email.
    var chipsRow = el('div', { class: 'ana-chips' });
    var anaCatalog = (window.CredimedFAQ && window.CredimedFAQ.ana) || [];
    var firstThree = anaCatalog.slice(0, 3);
    firstThree.forEach(function (entry) {
      chipsRow.appendChild(el('button', {
        class: 'ana-chip', type: 'button',
        onClick: function () { respond(entry.q_en); }
      }, entry.q_en));
    });
    chipsRow.appendChild(el('button', {
      class: 'ana-chip', type: 'button',
      onClick: function () {
        addMsg('user', 'Talk to a specialist');
        addMsg('ana', "I'll connect you to the team. Tap below to start an email — we'll have a human reply within one business day.");
        addEmailCta("I'd like to speak with a Credimed specialist.");
      }
    }, 'Talk to a specialist'));

    var input = el('input', {
      class: 'ana-input', type: 'text',
      placeholder: 'Type your question…', maxlength: '500'
    });
    var sendBtn = el('button', {
      class: 'ana-send', type: 'button', 'aria-label': 'Send',
      html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>'
    });
    function send() {
      var v = input.value.trim();
      if (!v) return;
      respond(v);
      input.value = '';
    }
    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); send(); }
    });

    drawer.appendChild(header);
    drawer.appendChild(body);
    drawer.appendChild(chipsRow);
    drawer.appendChild(el('div', { class: 'ana-input-row' }, [input, sendBtn]));
    drawer.appendChild(el('div', { class: 'ana-footer-link' }, 'Powered by Credimed · ' + SUPPORT_EMAIL));

    fab.addEventListener('click', function () {
      var open = drawer.classList.toggle('open');
      if (open) setTimeout(function () { input.focus(); }, 300);
    });

    document.body.appendChild(fab);
    document.body.appendChild(drawer);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildWidget);
  } else {
    buildWidget();
  }
})();
