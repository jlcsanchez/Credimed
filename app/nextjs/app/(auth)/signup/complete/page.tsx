"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthHero } from "@/components/auth/AuthHero";
import { PhoneField } from "@/components/auth/PhoneField";
import { PasswordField } from "@/components/auth/PasswordField";
import { StrengthMeter, scoreStrength } from "@/components/auth/StrengthMeter";
import { PrimaryButton } from "@/components/auth/PrimaryButton";
import { SuccessBanner } from "@/components/auth/SuccessBanner";
import { useAuthFlow } from "@/components/auth/AuthFlowProvider";

export default function CompletePage() {
  const router = useRouter();
  const { draft, setDraft } = useAuthFlow();
  const isOAuth = draft.method === "google" || draft.method === "apple";

  return isOAuth ? <CompleteOAuth /> : <CompleteEmail />;

  function CompleteOAuth() {
    const [phone, setPhone] = useState(draft.phone);
    const valid = phone.replace(/\D/g, "").length >= 7;
    const submit = () => {
      setDraft({ phone });
      // TODO: POST /api/signup/phone → triggers WhatsApp OTP
      router.push("/signup/verify");
    };
    return (
      <>
        <AuthHero title="Almost done" subtitle="Step 2 of 2 · Just your phone" step={2} total={2} pulse showBack backHref="/signup" />
        <div className="auth-card">
          <SuccessBanner email={draft.email} provider={draft.method === "apple" ? "Apple" : "Google"} />
          <div className="field">
            <PhoneField country={draft.country} onCountry={(c) => setDraft({ country: c })} phone={phone} onPhone={setPhone} />
            <div className="helper">We'll send a 6-digit code to verify your number.</div>
          </div>
          <PrimaryButton disabled={!valid} onClick={submit}>Send code</PrimaryButton>
          <div className="footnote">We use your phone only to send claim status updates. Never for marketing.</div>
        </div>
      </>
    );
  }

  function CompleteEmail() {
    const [phone, setPhone] = useState(draft.phone);
    const [pw, setPw] = useState("");
    const [pw2, setPw2] = useState("");
    const { score } = scoreStrength(pw);
    const match = pw && pw === pw2;
    const phoneOk = phone.replace(/\D/g, "").length >= 7;
    const canCreate = phoneOk && score >= 2 && match;
    const submit = () => {
      setDraft({ phone, password: pw });
      // TODO: POST /api/signup → creates user, triggers WhatsApp OTP
      router.push("/signup/verify");
    };
    return (
      <>
        <AuthHero title="Secure your account" subtitle="Step 2 of 2 · Almost there" step={2} total={2} showBack backHref="/signup" />
        <div className="auth-card">
          <div className="field">
            <PhoneField country={draft.country} onCountry={(c) => setDraft({ country: c })} phone={phone} onPhone={setPhone} />
            <div className="helper">We'll send a 6-digit code to verify.</div>
          </div>
          <div className="field">
            <label className="field-label">Password</label>
            <PasswordField value={pw} onChange={setPw} placeholder="Create a password" />
            <StrengthMeter password={pw} />
          </div>
          <div className="field">
            <label className="field-label">Confirm password</label>
            <PasswordField value={pw2} onChange={setPw2} placeholder="Re-enter password" />
            {pw2 && (
              <div className={`helper ${match ? "success" : "error"}`}>
                {match ? "✓ Passwords match" : "✗ Passwords do not match"}
              </div>
            )}
          </div>
          <PrimaryButton disabled={!canCreate} onClick={submit}>Create account &amp; send code</PrimaryButton>
          <div className="footnote">
            By creating an account you agree to our <a href="/terms">Terms</a> and authorize Credimed to charge our success fee (15% Standard, 10% Premium) on successful refunds.
          </div>
        </div>
      </>
    );
  }
}
