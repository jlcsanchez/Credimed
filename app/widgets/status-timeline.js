/**
 * Status timeline — visual progress component for the claim journey.
 *
 * Renders the path the patient's claim is taking, with completed
 * steps filled, the current step pulsing, and future steps muted.
 * Branches gracefully on the denied path (renders the denied node
 * instead of approved → paid).
 *
 * Usage:
 *   <div data-credimed-timeline data-status="in-review"></div>
 *   <script src="/app/widgets/status-timeline.js"></script>
 *
 * Or programmatically:
 *   CredimedTimeline.render(document.getElementById('mount'), 'paid');
 *
 * Status values: submitted | in-review | approved | paid | denied
 *
 * Why a separate widget instead of inline CSS in dashboard.html:
 *   - claim.html and dashboard.html both want it.
 *   - Designers can iterate on this single file without touching
 *     either page's layout.
 *   - The CSS is scoped (.cmt-* prefix) so it can't conflict with
 *     surrounding styles.
 */
(function () {
  'use strict';

  var STEPS = [
    { id: 'submitted', label: 'Submitted',  hint: "We've sent your claim to your insurer." },
    { id: 'in-review', label: 'In review',  hint: 'Your insurer is analyzing the claim. Most take 3–6 weeks.' },
    { id: 'approved',  label: 'Approved',   hint: 'Your insurer approved the refund. Payment is on the way.' },
    { id: 'paid',      label: 'Paid',       hint: 'Refund has been issued — usually arrives in 3–7 business days.' }
  ];

  // Denied is a branch off submitted/in-review, not a step in the
  // happy path. It collapses the trailing "approved → paid" nodes
  // into a single "denied" node with appropriate copy.
  var DENIED_STEP = {
    id: 'denied',
    label: 'Decision received',
    hint: 'Your insurer issued a decision. We will reach out about a free resubmission or money-back if eligible.'
  };

  function injectStyles() {
    if (document.getElementById('cmt-styles')) return;
    var s = document.createElement('style');
    s.id = 'cmt-styles';
    s.textContent =
      '.cmt-wrap{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#0F172A;padding:18px 4px}' +
      '.cmt-track{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;position:relative}' +
      '.cmt-step{flex:1;display:flex;flex-direction:column;align-items:center;text-align:center;position:relative;min-width:0}' +
      '.cmt-dot{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:#E2E8F0;color:#94A3B8;font-weight:700;font-size:13px;font-family:"SF Mono",Menlo,monospace;border:2px solid transparent;transition:all 200ms cubic-bezier(.2,.8,.2,1);z-index:2;flex-shrink:0}' +
      '.cmt-dot.done{background:#0D9488;color:#fff}' +
      '.cmt-dot.current{background:#fff;color:#0D9488;border-color:#0D9488;box-shadow:0 0 0 4px rgba(13,148,136,.18);animation:cmt-pulse 2.4s infinite}' +
      '.cmt-dot.denied{background:#FEE2E2;color:#B91C1C;border-color:#DC2626;box-shadow:0 0 0 4px rgba(220,38,38,.12)}' +
      '@keyframes cmt-pulse{0%,100%{box-shadow:0 0 0 4px rgba(13,148,136,.18)}50%{box-shadow:0 0 0 9px rgba(13,148,136,.06)}}' +
      '.cmt-label{margin-top:8px;font-size:11.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#475569}' +
      '.cmt-step.current .cmt-label{color:#0D9488}' +
      '.cmt-step.denied .cmt-label{color:#B91C1C}' +
      '.cmt-line{position:absolute;top:15px;left:50%;width:calc(100% + 8px);height:2px;background:#E2E8F0;z-index:1}' +
      '.cmt-line.done{background:#0D9488}' +
      '.cmt-step:last-child .cmt-line{display:none}' +
      '.cmt-hint{margin-top:14px;padding:12px 14px;background:#F0FDFA;border:1px solid #99F6E4;border-radius:10px;font-size:13px;line-height:1.5;color:#0F172A}' +
      '.cmt-hint.denied{background:#FEF2F2;border-color:#FECACA;color:#7F1D1D}' +
      '@media(max-width:480px){.cmt-label{font-size:10px}.cmt-dot{width:28px;height:28px;font-size:12px}.cmt-line{top:13px}}';
    document.head.appendChild(s);
  }

  function render(mount, status) {
    if (!mount) return;
    injectStyles();

    var st = String(status || 'submitted').toLowerCase();
    var isDenied = (st === 'denied');

    var path = isDenied
      ? [STEPS[0], { id: 'in-review-stub', label: 'In review', hint: '' }, DENIED_STEP]
      : STEPS;

    var currentIdx = 0;
    if (!isDenied) {
      for (var i = 0; i < STEPS.length; i++) {
        if (STEPS[i].id === st) { currentIdx = i; break; }
      }
    } else {
      currentIdx = 2;
    }

    var html = '<div class="cmt-wrap"><div class="cmt-track">';
    for (var j = 0; j < path.length; j++) {
      var step = path[j];
      var stateCls;
      if (isDenied && j === 2) stateCls = 'denied';
      else if (j < currentIdx) stateCls = 'done';
      else if (j === currentIdx) stateCls = 'current';
      else stateCls = '';

      var dotInner;
      if (stateCls === 'done') {
        dotInner = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      } else if (stateCls === 'denied') {
        dotInner = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      } else {
        dotInner = String(j + 1);
      }

      var lineCls = (j < currentIdx) ? 'cmt-line done' : 'cmt-line';

      html +=
        '<div class="cmt-step ' + stateCls + '">' +
          '<div class="cmt-dot ' + stateCls + '">' + dotInner + '</div>' +
          '<div class="cmt-label">' + step.label + '</div>' +
          (j < path.length - 1 ? '<div class="' + lineCls + '"></div>' : '') +
        '</div>';
    }
    html += '</div>';

    var current = path[currentIdx];
    var hintCls = isDenied ? 'cmt-hint denied' : 'cmt-hint';
    if (current && current.hint) {
      html += '<div class="' + hintCls + '">' + current.hint + '</div>';
    }
    html += '</div>';

    mount.innerHTML = html;
  }

  function autoMount() {
    var mounts = document.querySelectorAll('[data-credimed-timeline]');
    for (var i = 0; i < mounts.length; i++) {
      render(mounts[i], mounts[i].getAttribute('data-status'));
    }
  }

  window.CredimedTimeline = { render: render };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount);
  } else {
    autoMount();
  }
})();
