/**
 * Minimal cookie/privacy banner.
 *
 * Credimed only sets first-party session cookies (Cognito JWT,
 * sameSite localStorage). No third-party tracking cookies, no
 * advertising pixels, no analytics that drop persistent IDs.
 * Under that profile we don't legally need a consent toggle —
 * just a notice that cookies exist and a link to the policy
 * (CCPA compliance + GDPR "essential cookies" exemption).
 *
 * If the codebase later adds analytics or marketing pixels,
 * upgrade this to a real consent manager (e.g., Cookiebot,
 * OneTrust) — those are out of scope today.
 *
 * Self-contained: drop into any page with
 *   <script src="/cookie-banner.js" defer></script>
 * No CSS dependencies.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'credimed.cookieAck';

  // Already acknowledged in this browser? Don't render anything.
  try {
    if (localStorage.getItem(STORAGE_KEY) === '1') return;
  } catch (e) { /* localStorage blocked → still show banner */ }

  function buildBanner() {
    var banner = document.createElement('div');
    banner.id = 'credimed-cookie-banner';
    banner.style.cssText =
      'position:fixed;bottom:16px;left:16px;right:16px;max-width:560px;margin:0 auto;' +
      'background:#0F172A;color:#F8FAFC;padding:14px 18px;border-radius:14px;' +
      'box-shadow:0 12px 40px rgba(15,23,42,0.32);' +
      'display:flex;align-items:center;gap:14px;flex-wrap:wrap;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
      'font-size:13px;line-height:1.45;z-index:99999;' +
      'animation:credimed-cookie-in 280ms cubic-bezier(0.2,0.8,0.2,1);';

    var style = document.createElement('style');
    style.textContent =
      '@keyframes credimed-cookie-in{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}' +
      '#credimed-cookie-banner a{color:#5EEAD4;text-decoration:underline;text-underline-offset:2px}' +
      '#credimed-cookie-banner button{background:#0D9488;color:#fff;border:0;padding:8px 16px;border-radius:8px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:background 150ms}' +
      '#credimed-cookie-banner button:hover{background:#0B8278}' +
      '@media(max-width:480px){#credimed-cookie-banner{bottom:12px;left:12px;right:12px;padding:12px 14px}}';
    document.head.appendChild(style);

    banner.innerHTML =
      '<div style="flex:1;min-width:200px;">' +
        'We use essential cookies to keep you signed in and secure your session. We do not use tracking or advertising cookies. ' +
        '<a href="/legal/privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.' +
      '</div>' +
      '<button type="button" id="credimed-cookie-ok">Got it</button>';

    document.body.appendChild(banner);

    var dismiss = function () {
      try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) {}
      banner.style.transition = 'transform 220ms ease, opacity 220ms ease';
      banner.style.transform = 'translateY(20px)';
      banner.style.opacity = '0';
      setTimeout(function () { banner.remove(); }, 240);
    };
    document.getElementById('credimed-cookie-ok').addEventListener('click', dismiss);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildBanner);
  } else {
    buildBanner();
  }
})();
