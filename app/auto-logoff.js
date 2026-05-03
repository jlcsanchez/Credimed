/**
 * Auto-logoff after inactivity — HIPAA technical safeguard (45 CFR 164.312(a)(2)(iii)).
 *
 * Times out the Cognito + demo session after IDLE_MS of no user input,
 * and shows a 60-second countdown warning before signing out so the
 * patient can extend if they're still active.
 *
 * Wired by every authenticated page (dashboard, admin, documents, etc.)
 * via:  <script src="auto-logoff.js"></script>
 *
 * Public surface (window.CredimedAutoLogoff):
 *   .start()    — begin tracking activity
 *   .stop()     — stop tracking (e.g., on signout)
 *   .extend()   — reset the idle timer manually
 */
(function () {
  'use strict';

  var IDLE_MS    = 15 * 60 * 1000;   // 15 minutes before warning
  var WARNING_MS = 60 * 1000;        // 60 seconds to respond before logoff
  var ACTIVITY_EVENTS = [
    'mousedown', 'keydown', 'touchstart', 'scroll', 'click'
  ];

  var idleTimer    = null;
  var warningTimer = null;
  var modalEl      = null;
  var countdownEl  = null;
  var started      = false;

  function clearTimers() {
    if (idleTimer)    { clearTimeout(idleTimer); idleTimer = null; }
    if (warningTimer) { clearInterval(warningTimer); warningTimer = null; }
  }

  function reset() {
    clearTimers();
    hideWarning();
    idleTimer = setTimeout(showWarning, IDLE_MS);
  }

  function showWarning() {
    if (!modalEl) buildModal();
    modalEl.style.display = 'flex';
    var remaining = Math.floor(WARNING_MS / 1000);
    countdownEl.textContent = String(remaining);
    warningTimer = setInterval(function () {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(warningTimer);
        signOut();
      } else {
        countdownEl.textContent = String(remaining);
      }
    }, 1000);
  }

  function hideWarning() {
    if (modalEl) modalEl.style.display = 'none';
  }

  function signOut() {
    clearTimers();
    try {
      if (window.cognitoSignOut) window.cognitoSignOut();
    } catch (e) {}
    // Preserve where the user was so login can redirect back. Skip
    // the return param when already on login (avoids loops).
    var here = location.pathname + location.search + location.hash;
    var url = '/app/login.html?reason=inactivity';
    if (!/\/login\.html$/.test(location.pathname)) {
      url += '&return=' + encodeURIComponent(here);
    }
    location.href = url;
  }

  function buildModal() {
    modalEl = document.createElement('div');
    modalEl.style.cssText =
      'position:fixed;inset:0;background:rgba(15,23,42,0.65);' +
      'display:none;align-items:center;justify-content:center;z-index:99999;' +
      'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;' +
      'padding:16px;';
    var box = document.createElement('div');
    box.style.cssText =
      'background:#fff;border-radius:14px;max-width:420px;width:100%;' +
      'padding:24px;box-shadow:0 18px 48px rgba(15,23,42,0.25);';
    box.innerHTML =
      '<h3 style="margin:0 0 8px;font-size:18px;color:#0f172a;">Are you still there?</h3>' +
      '<p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.5;">' +
        'For your privacy, we automatically sign you out after a period of inactivity.' +
        ' You will be signed out in <strong id="cm-al-count">60</strong> seconds.' +
      '</p>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
        '<button id="cm-al-out"  style="padding:10px 14px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;color:#475569;cursor:pointer;font-size:14px;">Sign out</button>' +
        '<button id="cm-al-stay" style="padding:10px 14px;border-radius:8px;border:none;background:#0d9488;color:#fff;cursor:pointer;font-size:14px;font-weight:600;">Stay signed in</button>' +
      '</div>';
    modalEl.appendChild(box);
    document.body.appendChild(modalEl);
    countdownEl = box.querySelector('#cm-al-count');
    box.querySelector('#cm-al-stay').addEventListener('click', reset);
    box.querySelector('#cm-al-out').addEventListener('click', signOut);
  }

  function onActivity() {
    if (warningTimer) return;  // ignore activity during the warning window
    reset();
  }

  function start() {
    if (started) return;
    started = true;
    ACTIVITY_EVENTS.forEach(function (ev) {
      window.addEventListener(ev, onActivity, { passive: true });
    });
    reset();
  }

  function stop() {
    started = false;
    clearTimers();
    hideWarning();
    ACTIVITY_EVENTS.forEach(function (ev) {
      window.removeEventListener(ev, onActivity);
    });
  }

  window.CredimedAutoLogoff = { start: start, stop: stop, extend: reset };

  // Auto-start once DOM is ready unless the page opts out via
  // window.CREDIMED_AUTO_LOGOFF_MANUAL = true (e.g., for the login page).
  function autoStart() {
    if (window.CREDIMED_AUTO_LOGOFF_MANUAL) return;
    start();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoStart);
  } else {
    autoStart();
  }
})();
