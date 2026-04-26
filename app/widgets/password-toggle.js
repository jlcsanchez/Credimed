/**
 * Password show/hide toggle.
 *
 * Auto-discovers every <input type="password"> on the page and wraps it
 * with a small eye button on the right that toggles the input type
 * between "password" and "text". No CSS dependency — all styles inline
 * so it works whether the page imports the shell or not.
 *
 * The toggle button is tabindex=-1 so it doesn't disrupt keyboard tab
 * order through the form, and type=button so a click never submits.
 */
(function () {
  'use strict';

  var EYE =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>' +
    '<circle cx="12" cy="12" r="3"/></svg>';

  var EYE_OFF =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>' +
    '<path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 ' +
    '13.16 0 0 1-1.67 2.68"/>' +
    '<path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 ' +
    '0 0 0 5.39-1.61"/>' +
    '<line x1="2" y1="2" x2="22" y2="22"/></svg>';

  function addToggle(input) {
    if (input.dataset.passwordToggle) return;
    input.dataset.passwordToggle = '1';

    var parent = input.parentNode;
    if (!parent) return;

    // Wrap the input so we can absolutely-position the eye button on
    // its right edge without affecting surrounding layout.
    var wrap = document.createElement('span');
    wrap.style.cssText = 'position:relative;display:block;';
    parent.insertBefore(wrap, input);
    wrap.appendChild(input);

    // Reserve room for the eye button so the typed text doesn't slide
    // under it. Read the existing padding-right so we add to it instead
    // of clobbering anything explicit on the input.
    var existing = parseInt(getComputedStyle(input).paddingRight, 10) || 0;
    if (existing < 40) input.style.paddingRight = '40px';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.tabIndex = -1;
    btn.setAttribute('aria-label', 'Show password');
    btn.style.cssText =
      'position:absolute;right:6px;top:50%;transform:translateY(-50%);' +
      'background:transparent;border:none;cursor:pointer;padding:8px;' +
      'color:#64748B;display:flex;align-items:center;line-height:0;' +
      'border-radius:6px;transition:color .12s,background .12s;';
    btn.innerHTML = EYE;

    btn.addEventListener('mouseenter', function () {
      btn.style.color = '#0F766E';
      btn.style.background = '#F0FDFA';
    });
    btn.addEventListener('mouseleave', function () {
      btn.style.color = '#64748B';
      btn.style.background = 'transparent';
    });

    btn.addEventListener('click', function () {
      var hidden = input.type === 'password';
      input.type = hidden ? 'text' : 'password';
      btn.innerHTML = hidden ? EYE_OFF : EYE;
      btn.setAttribute('aria-label', hidden ? 'Hide password' : 'Show password');
    });

    wrap.appendChild(btn);
  }

  function init() {
    document.querySelectorAll('input[type="password"]').forEach(addToggle);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
