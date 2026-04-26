(function () {
  'use strict';

  var PHONE = '15125550134';
  var QUICK_REPLIES = [
    { text: 'What documents do I need?', msg: 'Hi Ana — what documents do I need to submit for my claim?' },
    { text: 'How long does it take?', msg: 'Hi Ana — how long will my claim take to process?' },
    { text: 'Is my data secure?', msg: 'Hi Ana — can you explain how my data is protected?' },
    { text: 'Talk to a specialist', msg: "Hi — I'd like to speak with a claims specialist." }
  ];

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

  function openWhatsApp(message) {
    /* Renamed externally to "Email Ana" — kept the function name so
       the call sites below don't have to change. WhatsApp doesn't
       sign HIPAA BAAs, so we route to support@credimed.us (Google
       Workspace BAA-covered) instead. */
    var subject = 'Pregunta para Ana';
    var url = 'mailto:support@credimed.us?subject=' +
              encodeURIComponent(subject) +
              '&body=' + encodeURIComponent(message);
    window.location.href = url;
  }

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
      '.ana-msg{max-width:80%;padding:10px 14px;border-radius:14px;font-size:13.5px;line-height:1.45;color:#1e293b}' +
      '.ana-msg.ana-from{background:#fff;border:1px solid #e2e8f0;border-bottom-left-radius:4px;align-self:flex-start}' +
      '.ana-msg.user-from{background:#0D9488;color:#fff;border-bottom-right-radius:4px;align-self:flex-end}' +
      '.ana-chips{padding:10px 14px;display:flex;flex-wrap:wrap;gap:6px;background:#fff;border-top:1px solid #e2e8f0}' +
      '.ana-chip{background:#f0fdfa;color:#0B8278;border:1px solid #99f6e4;padding:6px 12px;border-radius:999px;font-size:12px;cursor:pointer;font-family:inherit}' +
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

  function buildWidget() {
    if (document.querySelector('.ana-fab')) return;
    injectStyles();

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
      el('div', { class: 'ana-msg ana-from' }, "Hi! I'm Ana, your Credimed claims assistant."),
      el('div', { class: 'ana-msg ana-from' }, "I can help with documents, timing, or plan questions. What's up?")
    ]);

    var chipsRow = el('div', { class: 'ana-chips' });
    QUICK_REPLIES.forEach(function (r) {
      chipsRow.appendChild(el('button', {
        class: 'ana-chip', type: 'button',
        onClick: function () { openWhatsApp(r.msg); }
      }, r.text));
    });

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
      openWhatsApp('Hi Ana — ' + v);
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
    drawer.appendChild(el('div', { class: 'ana-footer-link' }, 'Powered by Credimed · support@credimed.us'));

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
