# Credimed — Auth screens

High-fidelity mobile-first auth flow for the Credimed patient app. Matches the live landing aesthetic at credimed.us (teal `#0D9488`, hero gradient `160deg #0f172a → #134e4a → #0D9488`, Playfair Display + DM Sans).

## What's in the box

| Path | What it is |
|---|---|
| `index.html` | **The deliverable.** Fully self-contained prototype + design canvas. Open in any browser. |
| `styles/tokens.css` | Design tokens (color, type, radii, shadows, gradient) — pulled out for reuse. |
| `styles/auth.css` | All auth-specific component styles (hero, cards, inputs, OTP, buttons, banners). |
| `components/AuthPrimitives.jsx` | Shared primitives: `AuthHero`, `OAuthButtons`, `PhoneField`, `PasswordInput`, `StrengthMeter`, `PrimaryButton`, country list. |
| `components/Screens.jsx` | The 5 screens: `SignupScreen`, `CompleteScreenA`, `CompleteScreenB`, `VerifyScreen`, `LoginScreen`, `SuccessScreen`. |
| `components/design-canvas.jsx` | Figma-style pan/zoom canvas used in the Canvas tab. |
| `nextjs/` | **Next.js-ready port** — TypeScript components for `app/(auth)/`. See `nextjs/README.md`. |
| `assets/mark.svg` | Credimed mark (teal "H" glyph). |
| `auth-flow.standalone.html` | Single-file bundled build — works offline, no dependencies. |

## The 5 screens

1. **`/signup`** — Step 1 of 2. OAuth (Google/Apple) + First name / Last name / Email.
2. **`/signup/complete`** — Step 2 of 2. Two variants:
   - **A (OAuth):** Green "Signed in as …" banner + WhatsApp phone + "Send code →".
   - **B (Email):** WhatsApp phone + Password (with 4-segment strength meter) + Confirm password (with match indicator) + "Create account & send code →".
3. **`/signup/verify`** — 6-digit OTP boxes, auto-advance, paste support, auto-submit on 6th digit. 45s resend countdown, error shake + attempts-remaining, success flash.
4. **`/login`** — OAuth + email/password. Forgot password link, "Create an account" footer link.
5. **`/signup/success`** — Transient. Full-bleed hero gradient, popping white checkmark, `"You're in, {firstName} 👋"`, 3-dot teal-mint spinner, auto-redirect after 2s.

## Running it

```bash
# Locally — just open the file
open index.html

# Or serve the folder
npx serve .
```

No build step. React + Babel are loaded from unpkg CDN.

## Prototype controls

- **Tab bar (top):** switch between **Prototype** (clickable mobile + desktop frames side-by-side) and **Canvas** (Figma-style overview of all 6 artboards).
- **Bottom pill nav:** jump between any of the 5 screens directly.
- **Tweaks panel** (toggle via toolbar): force Screen 2 to Variant A or B regardless of sign-up method.

## Design tokens — summary

| Token | Value |
|---|---|
| Primary | `#0D9488` (teal-600) |
| Teal dark | `#0A7A70` (teal-800) |
| Mint accent | `#5EEAD4` (teal-300) |
| Hero gradient | `linear-gradient(160deg, #0f172a 0%, #134e4a 60%, #0D9488 100%)` |
| Card shadow | `0 8px 40px rgba(0,0,0,0.15)` |
| Input height | `52px` · radius `12px` |
| Primary button | `60px` · radius `14px` · teal fill |
| Card radius | `16px` |
| Focus ring | `0 0 0 4px rgba(13,148,136,0.18)` |
| Display font | Playfair Display 700/900 |
| UI font | DM Sans 400–700 |

## Moving to Next.js

See `nextjs/README.md`. The TSX components there are drop-in for `app/(auth)/`:

```
app/
  (auth)/
    layout.tsx
    signup/
      page.tsx
      complete/page.tsx
      verify/page.tsx
      success/page.tsx
    login/page.tsx
```

## Interactions wired up

- Countries: 🇲🇽 +52 (default), 🇺🇸 +1, 🇪🇸 +34, 🇬🇧 +44, 🇦🇷 +54, 🇨🇴 +57, 🇨🇱 +56, 🇵🇪 +51, 🇧🇷 +55.
- OTP: auto-advance, `Backspace` moves left, paste detects 6 digits, auto-submits on fill. Code `123456` always succeeds in demo; others have a ~70% success rate to preview error state.
- Password strength scores length + class diversity (lowercase+uppercase, digit, symbol) into 4 levels.
- Form CTAs are disabled until validation passes.
