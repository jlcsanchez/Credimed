# Credimed Next.js — Auth screens

Drop-in TypeScript port of the 5 auth screens, ready for Next.js App Router.

## File map

```
app/
  (auth)/
    layout.tsx                       ← from layout.tsx
    signup/
      page.tsx                       ← from signup/page.tsx         (Screen 1)
      complete/page.tsx              ← from signup/complete/page.tsx (Screen 2, auto-picks variant)
      verify/page.tsx                ← from signup/verify/page.tsx   (Screen 3)
      success/page.tsx               ← from signup/success/page.tsx  (Screen 5)
    login/page.tsx                   ← from login/page.tsx           (Screen 4)
components/
  auth/
    AuthHero.tsx
    OAuthButtons.tsx
    PhoneField.tsx
    PasswordField.tsx
    StrengthMeter.tsx
    PrimaryButton.tsx
    SuccessBanner.tsx
    countries.ts
styles/
  auth.css                           ← copy globals + import in layout.tsx
  tokens.css                         ← copy globals + import in layout.tsx
```

## Install

```bash
# In your Next.js app
npm install

# Add fonts to app/layout.tsx
import { Playfair_Display, DM_Sans } from "next/font/google";
const playfair = Playfair_Display({ subsets: ["latin"], weight: ["600","700","800","900"], variable: "--font-display" });
const dm = DM_Sans({ subsets: ["latin"], weight: ["400","500","600","700"], variable: "--font-ui" });
```

Then in the root `<body className={`${playfair.variable} ${dm.variable}`}>`.

In `app/(auth)/layout.tsx`:

```tsx
import "@/styles/tokens.css";
import "@/styles/auth.css";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="auth-app">{children}</div>;
}
```

## Routing + state

The flow passes user data across screens. Easiest options:

- **Server:** store sign-up state in a signed cookie or `sessionStorage` after Step 1, read it in Step 2.
- **Client:** wrap `(auth)` in a Context Provider that holds `{firstName, lastName, email, method, country, phone}` across routes.

A minimal client-side provider is included at `components/auth/AuthFlowProvider.tsx`.

## What changed vs the JSX prototype

- All inline `<script>` blocks are now real TSX files with explicit types.
- `window.XYZ` globals are replaced with ES imports.
- `useState` callbacks use proper typed event handlers.
- Country list is exported as a `const` with a `Country` type.
- OTP auto-submit, paste, shake/flash animations are preserved.
- Fake `setTimeout` demo logic (`VerifyScreen`) is marked with `// TODO: replace with real API`.

## Env / API hooks to wire up

| Screen | What to call |
|---|---|
| `/signup` OAuth buttons | `signIn('google')` / `signIn('apple')` via NextAuth or Supabase. |
| `/signup` email submit | `POST /api/signup` → stores partial user, redirects to `/signup/complete`. |
| `/signup/complete` submit | `POST /api/signup/phone` → triggers WhatsApp OTP send. |
| `/signup/verify` submit | `POST /api/signup/verify { code }` → issues session, redirects to `/signup/success`. |
| `/login` submit | `signIn('credentials', { email, password })`. |
| `/signup/success` | `router.push('/dashboard')` after 2s. |
