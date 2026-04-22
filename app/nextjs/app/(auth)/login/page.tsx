"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthHero } from "@/components/auth/AuthHero";
import { OAuthButtons, Divider } from "@/components/auth/OAuthButtons";
import { PasswordField } from "@/components/auth/PasswordField";
import { PrimaryButton } from "@/components/auth/PrimaryButton";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const canSignIn = /.+@.+\..+/.test(email) && pw.length >= 6;

  const signIn = () => {
    // TODO: NextAuth signIn('credentials', { email, password: pw })
    router.push("/signup/success");
  };

  const oauth = (_provider: "google" | "apple") => {
    // TODO: NextAuth signIn(_provider)
    router.push("/signup/success");
  };

  return (
    <>
      <AuthHero title="Welcome back" subtitle="Sign in to check your claim" />
      <div className="auth-card">
        <OAuthButtons onGoogle={() => oauth("google")} onApple={() => oauth("apple")} />
        <Divider />
        <div className="field">
          <input className="input" type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <PasswordField value={pw} onChange={setPw} placeholder="Password" autoComplete="current-password" />
        </div>
        <div style={{ textAlign: "right", marginTop: -6, marginBottom: 8 }}>
          <Link className="link-teal" href="/forgot-password" style={{ fontSize: 13 }}>Forgot password?</Link>
        </div>
        <PrimaryButton disabled={!canSignIn} onClick={signIn}>Sign in</PrimaryButton>
        <div className="card-footer">
          New here? <Link href="/signup">Create an account</Link>
        </div>
      </div>
    </>
  );
}
