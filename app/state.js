(function (global) {
  'use strict';

  var STORAGE_KEY = 'credimed:state';
  var listeners = {};

  function read() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function write(obj) {
    try {
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
    var existing = get('claim.id');
    if (existing) return existing;
    var year = new Date().getFullYear();
    var hex = Math.random().toString(16).slice(2, 8).toUpperCase();
    var id = 'CMX-' + year + '-' + hex;
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
    set('claim', claim);
    set('payment.status', 'paid');
    set('payment.paidAt', now.toISOString());
    return claim;
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
    formatMoney: formatMoney,
    formatDateRange: formatDateRange,
    getInitials: getInitials,
    getDisplayName: getDisplayName,
    _read: read
  };
})(window);
