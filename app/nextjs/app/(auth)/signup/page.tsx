"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthHero } from "@/components/auth/AuthHero";
import { OAuthButtons, Divider } from "@/components/auth/OAuthButtons";
import { PrimaryButton } from "@/components/auth/PrimaryButton";
import { useAuthFlow } from "@/components/auth/AuthFlowProvider";

export default function SignupPage() {
  const router = useRouter();
  const { setDraft } = useAuthFlow();
  const [firstName, setFirst] = useState("");
  const [lastName, setLast] = useState("");
  const [email, setEmail] = useState("");
  const canContinue = firstName.trim() && lastName.trim() && /.+@.+\..+/.test(email);

  const goOAuth = (method: "google" | "apple") => {
    // TODO: replace with real OAuth sign-in (NextAuth / Supabase)
    setDraft({ method, email: method === "google" ? "john@gmail.com" : "john@icloud.com" });
    router.push("/signup/complete");
  };

  const goEmail = () => {
    setDraft({ method: "email", firstName, lastName, email });
    router.push("/signup/complete");
  };

  return (
    <>
      <AuthHero title="Create your account" subtitle="Step 1 of 2 · Start your claim" step={1} total={2} />
      <div className="auth-card">
        <OAuthButtons onGoogle={() => goOAuth("google")} onApple={() => goOAuth("apple")} />
        <Divider />
        <div className="input-row">
          <div className="field">
            <input className="input" placeholder="First name" value={firstName} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" />
          </div>
          <div className="field">
            <input className="input" placeholder="Last name" value={lastName} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" />
          </div>
        </div>
        <div className="field">
          <input className="input" type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        <PrimaryButton disabled={!canContinue} onClick={goEmail}>Continue</PrimaryButton>
        <div className="card-footer">
          Already have an account? <Link href="/login">Sign in</Link>
        </div>
      </div>
    </>
  );
}
