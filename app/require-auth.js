/**
 * require-auth.js — proactive session check on page load.
 *
 * Runs synchronously *before* the rest of the page wires up. If the
 * user has no Cognito ID token in localStorage AND no demo session,
 * redirects to login.html with a return URL so they come back here
 * after authenticating.
 *
 * Why proactive (not reactive on first authFetch failure):
 *   - Authenticated pages render UI scaffolding before they make
 *     their first API call. If the user is logged out, they see a
 *     half-rendered page with broken state until something tries to
 *     fetch — confusing and feels broken.
 *   - HIPAA auditors expect "automatic logoff" to be enforced for
 *     all PHI-bearing pages. A synchronous check at load is the
 *     standard pattern.
 *
 * Public pages (landing, legal docs, login itself) must NOT include
 * this script. Setting window.CREDIMED_AUTH_OPTIONAL = true before
 * loading also opts out (e.g., for FAQs that work logged in or out).
 */
(function () {
  'use strict';

  if (window.CREDIMED_AUTH_OPTIONAL) return;

  function hasDemoSession() {
    try {
      var raw = localStorage.getItem('credimed.demo');
      if (!raw) return false;
      var d = JSON.parse(raw);
      return !!(d && (d.email || d.isAdmin));
    } catch (e) { return false; }
  }

  function hasCognitoToken() {
    /* Cognito Identity SDK stores the ID token at a key like
       CognitoIdentityServiceProvider.<clientId>.<sub>.idToken
       — we just check for the presence of any such key, not the
       token's freshness. authFetch handles expiry on the next
       network call. The point of this check is to weed out the
       "user never signed in" case, not to gate every render on
       a fresh token. */
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && /^CognitoIdentityServiceProvider\..+\..+\.idToken$/.test(k)) {
          var v = localStorage.getItem(k);
          if (v && v.length > 20) return true;
        }
      }
    } catch (e) {}
    return false;
  }

  if (hasDemoSession() || hasCognitoToken()) return;

  // No session. Hide the page and bounce to login. The hide step
  // prevents a flash of authenticated UI before the redirect lands.
  try {
    var s = document.createElement('style');
    s.textContent = 'html,body{visibility:hidden!important;background:#FAF6EF!important;}';
    (document.head || document.documentElement).appendChild(s);
  } catch (e) {}

  var here = location.pathname + location.search + location.hash;
  var url = '/app/login.html?reason=signin';
  if (!/\/login\.html$/.test(location.pathname)) {
    url += '&return=' + encodeURIComponent(here);
  }
  location.replace(url);
})();
