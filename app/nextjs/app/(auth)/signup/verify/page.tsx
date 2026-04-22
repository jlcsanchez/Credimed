"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthHero } from "@/components/auth/AuthHero";
import { useAuthFlow } from "@/components/auth/AuthFlowProvider";

function maskPhone(code: string, phone: string) {
  const digits = (phone || "").replace(/\D/g, "");
  const last4 = digits.slice(-4) || "1234";
  return `${code} •• •••• ${last4.replace(/(\d{2})(\d{2})/, "$1 $2")}`;
}

type Status = "idle" | "loading" | "success" | "error";

export default function VerifyPage() {
  const router = useRouter();
  const { draft } = useAuthFlow();
  const phoneMasked = maskPhone(draft.country.code, draft.phone);

  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [status, setStatus] = useState<Status>("idle");
  const [attempts, setAttempts] = useState(3);
  const [countdown, setCountdown] = useState(45);
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  useEffect(() => { refs.current[0]?.focus(); }, []);

  const submit = (code: string) => {
    setStatus("loading");
    // TODO: POST /api/signup/verify { code } — issues session, redirect
    setTimeout(() => {
      if (code === "123456") {
        setStatus("success");
        setTimeout(() => router.push("/signup/success"), 600);
      } else {
        setStatus("error");
        setAttempts((a) => Math.max(0, a - 1));
        setTimeout(() => {
          setDigits(["", "", "", "", "", ""]);
          setStatus("idle");
          refs.current[0]?.focus();
        }, 900);
      }
    }, 550);
  };

  const setDigit = (i: number, v: string) => {
    const clean = v.replace(/\D/g, "").slice(0, 1);
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    setStatus("idle");
    if (clean && i < 5) refs.current[i + 1]?.focus();
    if (next.every((d) => d !== "")) submit(next.join(""));
  };

  const onKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < 5) refs.current[i + 1]?.focus();
  };

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const paste = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (paste.length === 6) {
      e.preventDefault();
      setDigits(paste.split(""));
      refs.current[5]?.focus();
      submit(paste);
    }
  };

  return (
    <>
      <AuthHero title="Enter verification code" subtitle={`We sent a code to ${phoneMasked}`} showBack backHref="/signup/complete" variant="short" />
      <div className="auth-card">
        <div className="otp-wrap" onPaste={onPaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => (refs.current[i] = el)}
              className={`otp-box ${d ? "filled" : ""} ${status === "success" ? "success" : ""} ${status === "error" ? "error" : ""}`}
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => onKey(i, e)}
              disabled={status === "loading" || status === "success"}
              aria-label={`Digit ${i + 1}`}
            />
          ))}
        </div>

        {status === "error" && (
          <div className="helper error" style={{ textAlign: "center", marginBottom: 12 }}>
            Invalid code. {attempts} attempts remaining
          </div>
        )}

        <div className="resend-row">
          {countdown > 0 ? (
            <span className="muted">Resend code in 0:{String(countdown).padStart(2, "0")}</span>
          ) : (
            <a className="link-teal" onClick={() => setCountdown(45)}>Resend code</a>
          )}
        </div>
        <div className="resend-row" style={{ marginTop: 12 }}>
          Wrong number? <a className="link-teal" onClick={() => router.push("/signup/complete")}>Change it</a>
        </div>
      </div>
    </>
  );
}
