(function () {
  'use strict';

  const FLOW = {
    'documents':    { next: 'processing',  back: null },
    'processing':   { next: 'estimate',    back: null, autoAdvanceMs: 8000 },
    'estimate':     { next: 'plan',        back: 'documents' },
    'plan':         { next: 'before-sign', back: 'estimate' },
    'before-sign':  { next: 'agreement',   back: 'plan' },
    'agreement':    { next: 'payment',     back: 'before-sign' }
    /* payment is intentionally OMITTED from the flow map — the Stripe confirm
       flow is the sole owner of navigation away from payment.html. On success
       Stripe redirects to /app/submission-confirmed.html?paid=1 via return_url.
       On failure Stripe keeps the user on the page with an error. Having a
       connector rule here would fire submission-confirmed navigation on every
       btn-primary click, including failed/cancelled Apple Pay sessions,
       making the app appear to succeed when no charge was made. */
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
