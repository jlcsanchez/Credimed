# Credimed brand assets

Static assets used by the team — not by the runtime app. Drop here
anything that supports operations: email signatures, brand swatches,
copy templates, reusable HTML snippets.

## Files

| File | Purpose | Who uses it |
|---|---|---|
| `email-signature.html` | Raw HTML for the Gmail / Workspace email signature, with install instructions in the file header | Founders / staff with `@credimed.us` Workspace mailboxes |
| `email-signature-preview.html` | The same signature inside a render frame so you can preview it in a browser before pasting into Gmail | Anyone setting up their signature |

## Install the email signature (3 minutes)

1. **Preview it.** Open `docs/email-signature-preview.html` in a browser. The signature appears at the bottom of a sample reply, exactly as it'll look on the recipient's side.
2. **Select it.** Click anywhere inside the rendered signature, then click-and-drag from the name "Juan Luis Sanchez" all the way down through the HIPAA confidentiality footer at the bottom. (Or use Cmd+A / Ctrl+A inside the signature block.)
3. **Copy.** Cmd+C on Mac, Ctrl+C on Windows.
4. **Paste into Gmail.** Settings (gear top-right) → "See all settings" → scroll to "Signature" → "Create new" → name it "Credimed" → paste.
5. **Set as default.** "Signature defaults" → both fields = "Credimed" → tick "Insert signature before quoted text in replies".
6. **Save.** Bottom of the settings page.

The signature uses the same brand mark (white "H" in teal-600 circle), the same color palette (teal, slate, cream), and the same typography stack as the transactional emails patients receive — so external recipients see one consistent Credimed identity whether the email came from the system or from you personally.

## Updating the signature

Edit `email-signature.html` (or `email-signature-preview.html` for the live render frame), commit, then re-paste into Gmail. The signature lives in Gmail's settings — updating this file doesn't update Gmail until you re-do step 4 above.
