(function (global) {
  'use strict';

  var STORAGE_KEY = 'credimed:state';
  /* SCHEMA_VERSION: bump whenever the shape of the persisted state
     object changes incompatibly. read() drops state whose version
     doesn't match so old in-flight claims don't show up rendered
     against new keys. Bump in the same commit that introduces the
     new shape, never separately. */
  /* v2 — drops Claude Design demo data (CMX-2026-DEMO9 / Alex Rivera /
     ceo@credimed.us) that lingered in localStorage from previous demo
     logins, so a fresh signup starts with a clean slate. */
  var SCHEMA_VERSION = 2;
  var listeners = {};

  function read() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { _v: SCHEMA_VERSION };
      var parsed = JSON.parse(raw);
      if (parsed && parsed._v === SCHEMA_VERSION) return parsed;
      // Old/unknown schema — discard. No migration today; the user
      // re-enters the few fields in the active step. If the cost of
      // that ever gets too high, write a real migrator here.
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      return { _v: SCHEMA_VERSION };
    } catch (e) {
      return { _v: SCHEMA_VERSION };
    }
  }

  function write(obj) {
    try {
      // Always stamp the version on every write so a partially-written
      // tree from a tab crash still validates on next read.
      obj._v = SCHEMA_VERSION;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {}
  }

  function notify(key, value) {
    (listeners[key] || []).forEach(function (cb) {
      try { cb(value); } catch (e) {}
    });
    (listeners['*'] || []).forEach(function (cb) {
      try { cb(key, value); } catch (e) {}
    });
  }

  function get(path, fallback) {
    var obj = read();
    if (!path) return obj;
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return fallback;
      cur = cur[parts[i]];
    }
    return cur == null ? fallback : cur;
  }

  function set(path, value) {
    var obj = read();
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
    write(obj);
    notify(path, value);
  }

  function merge(path, partial) {
    var current = get(path, {});
    var next = Object.assign({}, current, partial);
    set(path, next);
  }

  function clear() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    notify('*', null);
  }

  function on(key, cb) {
    if (!listeners[key]) listeners[key] = [];
    listeners[key].push(cb);
    return function off() {
      listeners[key] = (listeners[key] || []).filter(function (c) { return c !== cb; });
    };
  }

  function generateClaimId() {
    // If there's a pending in-flight id AND that id already belongs to
    // a claim that was submitted, drop it — the user is starting a NEW
    // claim, not resuming the one they just paid for. Without this the
    // payment screen reuses the previous PaymentIntent (already
    // `succeeded`) and Stripe Elements renders empty.
    var pendingId = get('pendingClaimId');
    var existing  = get('claim', null);
    if (pendingId && existing && existing.id === pendingId && existing.submittedAt) {
      set('pendingClaimId', null);
      pendingId = null;
    }

    // Reuse the in-flight id if one exists (so the same id flows through
    // documents → plan → agreement → payment during a single claim).
    if (pendingId) return pendingId;

    // Backward-compat: older sessions stored the in-flight id on claim.id.
    // If there's a claim object that hasn't been submitted yet (no
    // submittedAt), adopt its id so we don't accidentally mint two.
    var active = get('claim', null);
    if (active && active.id && !active.submittedAt) {
      set('pendingClaimId', active.id);
      return active.id;
    }

    // Fresh claim (no in-flight id, previous claim was already submitted
    // or there never was one). Mint a new id and stash it so subsequent
    // pages in this flow reuse it.
    var year = new Date().getFullYear();
    var hex = Math.random().toString(16).slice(2, 8).toUpperCase();
    var id = 'CMX-' + year + '-' + hex;
    set('pendingClaimId', id);
    return id;
  }

  function submitClaim() {
    var id = generateClaimId();
    var now = new Date();
    var expectedMin = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    var expectedMax = new Date(now.getTime() + 42 * 24 * 60 * 60 * 1000);
    var claim = {
      id: id,
      status: 'in-review',
      submittedAt: now.toISOString(),
      expectedByMin: expectedMin.toISOString(),
      expectedByMax: expectedMax.toISOString(),
      tracker: { submitted: true, inReview: true, approved: false, paid: false },
      plan: get('plan.selected', 'premium'),
      paidAmount:     get('receipt.amountPaid', null),
      paidAmountUSD:  get('receipt.amountPaidUSD', null),
      paidCurrency:   get('receipt.currency', null),
      estimateMin: get('estimate.rangeMin', null),
      estimateMax: get('estimate.rangeMax', null),
      city: get('receipt.city', null),
      procedures: get('receipt.procedures', null),
      procedure: get('receipt.procedure', null)
    };

    // Persist this claim as the ACTIVE one (what the dashboard shows by
    // default) AND append it to the historical `claims` array so prior
    // claims don't get wiped every time the user starts a new flow.
    // Order: most-recent-first so `claims[0]` is always the active one.
    var history = get('claims', []) || [];
    if (!Array.isArray(history)) history = [];
    // De-dupe: if for some reason this id is already in history (same
    // session calling submitClaim twice), replace in place.
    history = history.filter(function (c) { return c && c.id !== claim.id; });
    history.unshift(claim);
    set('claims', history);
    set('claim', claim);
    set('payment.status', 'paid');
    set('payment.paidAt', now.toISOString());
    return claim;
  }

  // Return the full historical claims array (most-recent first). Dashboard
  // can show a 'Previous claims' list; admin queue can iterate. The single
  // active `claim` object stays as the default the dashboard renders.
  function getAllClaims() {
    var history = get('claims', []) || [];
    return Array.isArray(history) ? history : [];
  }

  function formatMoney(n) {
    if (n == null || isNaN(n)) return '';
    return '$' + Number(n).toLocaleString('en-US');
  }

  function formatDateRange(minIso, maxIso) {
    if (!minIso || !maxIso) return '';
    var opts = { month: 'short', day: 'numeric', year: 'numeric' };
    var a = new Date(minIso).toLocaleDateString('en-US', opts);
    var b = new Date(maxIso).toLocaleDateString('en-US', opts);
    return a + ' – ' + b;
  }

  function getInitials() {
    var first = (get('user.firstName', '') || '').trim();
    var last = (get('user.lastName', '') || '').trim();
    var i = (first[0] || '') + (last[0] || '');
    return i.toUpperCase() || 'J';
  }

  function getDisplayName() {
    var first = (get('user.firstName', '') || '').trim();
    return first || 'there';
  }

  global.CredimedState = {
    get: get,
    set: set,
    merge: merge,
    clear: clear,
    on: on,
    generateClaimId: generateClaimId,
    submitClaim: submitClaim,
    getAllClaims: getAllClaims,
    formatMoney: formatMoney,
    formatDateRange: formatDateRange,
    getInitials: getInitials,
    getDisplayName: getDisplayName,
    _read: read
  };
})(window);
