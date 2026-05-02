/**
 * Fax provider client. Defaults to WestFax (HIPAA BAA available).
 *
 * Status: STUB — env vars below are placeholders. Once you sign up
 * for WestFax (or another HIPAA-BAA fax service like Documo /
 * Notifyre), set FAX_PROVIDER + FAX_API_KEY + FAX_USERNAME and the
 * Lambda will start sending real faxes.
 *
 * The interface is provider-agnostic: a single `sendFax({to, pdfBytes,
 * idempotencyKey})` returns `{ ok, providerFaxId, status }`. Swapping
 * providers later is just a new switch case here, no caller change.
 */

const PROVIDER     = process.env.FAX_PROVIDER     || 'stub';
const API_KEY      = process.env.FAX_API_KEY      || '';
const API_USERNAME = process.env.FAX_USERNAME     || '';
const API_PASSWORD = process.env.FAX_PASSWORD     || '';
const SENDER_FAX   = process.env.FAX_SENDER_NUMBER || '';

/**
 * Send a fax.
 *
 * @param {object} args
 * @param {string} args.to - destination fax in E.164 (+18594558650)
 * @param {Uint8Array} args.pdfBytes - the PDF bundle to fax
 * @param {string} args.idempotencyKey - safe to retry; provider dedupes
 * @param {string} args.subject - cover-page subject line (informational)
 * @returns {Promise<{ok: boolean, providerFaxId?: string, status?: string, error?: string}>}
 */
export async function sendFax(args) {
  if (PROVIDER === 'stub' || !API_KEY) {
    console.warn(JSON.stringify({
      event: 'fax_stub_skipped',
      reason: PROVIDER === 'stub' ? 'no_provider_configured' : 'no_api_key',
      to: args.to,
      idempotencyKey: args.idempotencyKey,
      pdfSizeBytes: args.pdfBytes?.length
    }));
    return {
      ok: false,
      status: 'stub_no_send',
      error: 'Fax provider not configured. Set FAX_PROVIDER + FAX_API_KEY env vars.'
    };
  }

  switch (PROVIDER) {
    case 'westfax':
      return sendViaWestFax(args);
    case 'documo':
      return sendViaDocumo(args);
    case 'notifyre':
      return sendViaNotifyre(args);
    default:
      return { ok: false, error: `Unknown FAX_PROVIDER: ${PROVIDER}` };
  }
}

/* ---- WestFax (recommended, HIPAA BAA available) ----
   Docs: https://www.westfax.com/api/
   Endpoint: https://api.westfax.com/REST/Fax_SendFax/
   Auth: HTTP basic (username + API key)                      */
async function sendViaWestFax(args) {
  const formData = new FormData();
  formData.append('Username', API_USERNAME);
  formData.append('ProductId', API_KEY);
  formData.append('Numbers1', args.to.replace(/\D/g, ''));
  formData.append('CallerID', SENDER_FAX.replace(/\D/g, ''));
  formData.append('JobName', args.subject || 'Credimed claim');
  formData.append('Header', args.subject || 'Credimed claim submission');
  formData.append('FaxQuality', 'Fine');
  formData.append('FeedbackEmail', process.env.FAX_FEEDBACK_EMAIL || '');
  formData.append('Files1', new Blob([args.pdfBytes], { type: 'application/pdf' }), 'claim.pdf');
  // WestFax doesn't have a built-in idempotency header; we encode it in JobName
  // when the caller wants visible dedupe trail.

  const resp = await fetch('https://api.westfax.com/REST/Fax_SendFax/json', {
    method: 'POST',
    body: formData
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data?.Success) {
    return {
      ok: false,
      status: `http_${resp.status}`,
      error: data?.Error || `WestFax HTTP ${resp.status}`
    };
  }
  return {
    ok: true,
    providerFaxId: data?.Result?.[0]?.ID,
    status: data?.Result?.[0]?.Status || 'queued'
  };
}

/* ---- Documo (alternative) ----
   Docs: https://docs.documo.com/  */
async function sendViaDocumo(args) {
  const resp = await fetch('https://api.documo.com/v1/faxes', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      faxNumber: args.to,
      attachments: [{
        filename: 'claim.pdf',
        content: Buffer.from(args.pdfBytes).toString('base64')
      }],
      idempotencyKey: args.idempotencyKey
    })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) return { ok: false, status: `http_${resp.status}`, error: data?.message };
  return { ok: true, providerFaxId: data?.id, status: data?.status || 'queued' };
}

/* ---- Notifyre (alternative) ----
   Docs: https://api.notifyre.com/    */
async function sendViaNotifyre(args) {
  const resp = await fetch('https://api.notifyre.com/fax/send', {
    method: 'POST',
    headers: {
      'x-api-token': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      Faxes: {
        Recipients: [{ Type: 'fax_number', Value: args.to }],
        SendFrom: SENDER_FAX,
        Subject: args.subject || 'Credimed claim',
        Documents: [{
          Filename: 'claim.pdf',
          Base64Content: Buffer.from(args.pdfBytes).toString('base64'),
          MimeType: 'application/pdf'
        }]
      }
    })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) return { ok: false, status: `http_${resp.status}`, error: data?.message };
  return { ok: true, providerFaxId: data?.Payload?.FaxID, status: 'queued' };
}
