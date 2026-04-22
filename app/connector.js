(function () {
  'use strict';

  const FLOW = {
    'documents':    { next: 'processing',  back: null },
    'processing':   { next: 'estimate',    back: null, autoAdvanceMs: 8000 },
    'estimate':     { next: 'plan',        back: 'documents' },
    'plan':         { next: 'before-sign', back: 'estimate' },
    'before-sign':  { next: 'agreement',   back: 'plan' },
    'agreement':    { next: 'payment',     back: 'before-sign' },
    'payment':      { next: 'submission-confirmed', back: 'agreement' }
  };

  function currentScreen() {
    const m = location.pathname.match(/\/app\/([a-z-]+)\.html$/);
    return m ? m[1] : null;
  }

  function goTo(screen) {
    location.href = '/app/' + screen + '.html';
  }

  const current = currentScreen();
  if (!current || !FLOW[current]) return;

  const step = FLOW[current];

  document.addEventListener('click', function (e) {
    const primary = e.target.closest('.footer-cta .btn-primary');
    if (primary && step.next && !primary.hasAttribute('disabled')) {
      e.preventDefault();
      e.stopPropagation();
      goTo(step.next);
      return;
    }
    const back = e.target.closest('.back-btn');
    if (back && step.back) {
      e.preventDefault();
      e.stopPropagation();
      goTo(step.back);
    }
  }, true);

  if (step.autoAdvanceMs && step.next) {
    setTimeout(function () { goTo(step.next); }, step.autoAdvanceMs);
  }
})();
