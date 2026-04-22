/* global React, AuthHero, OAuthButtons, Divider, Field, TextInput, PasswordInput, PhoneField, SuccessBanner, StrengthMeter, PrimaryButton, COUNTRIES, scoreStrength */
const { useState, useEffect, useRef } = React;

/* ============================================================
   SCREEN 1 — /signup (step 1 of 2)
   ============================================================ */
function SignupScreen({ onNext, onSignIn }) {
  const [firstName, setFirst] = useState("");
  const [lastName, setLast] = useState("");
  const [email, setEmail] = useState("");
  const canContinue = firstName.trim() && lastName.trim() && /.+@.+\..+/.test(email);

  return (
    <div className="auth-app">
      <AuthHero title="Create your account" subtitle="Step 1 of 2 · Start your claim" step={1} total={2} />
      <div className="auth-card">
        <OAuthButtons
          onGoogle={() => onNext({ method: "google", email: "john@gmail.com", firstName: "John", lastName: "Rivera" })}
          onApple={() => onNext({ method: "apple", email: "john@icloud.com", firstName: "John", lastName: "Rivera" })}
        />
        <Divider />
        <div className="input-row">
          <Field>
            <TextInput placeholder="First name" value={firstName} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" />
          </Field>
          <Field>
            <TextInput placeholder="Last name" value={lastName} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" />
          </Field>
        </div>
        <Field>
          <TextInput type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Field>
        <PrimaryButton disabled={!canContinue} onClick={() => onNext({ method: "email", email, firstName, lastName })}>
          Continue <span className="arrow">→</span>
        </PrimaryButton>
        <div className="card-footer">
          Already have an account? <a onClick={onSignIn}>Sign in</a>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   SCREEN 2 — /signup/complete (two variants)
   ============================================================ */
function CompleteScreenA({ user, onBack, onNext }) {
  const [country, setCountry] = useState(COUNTRIES[0]); // +52 default
  const [phone, setPhone] = useState("");
  const valid = phone.replace(/\D/g, "").length >= 7;
  return (
    <div className="auth-app">
      <AuthHero
        title="Almost done"
        subtitle="Step 2 of 2 · Just your phone"
        step={2}
        total={2}
        pulse
        onBack={onBack}
      />
      <div className="auth-card">
        <SuccessBanner email={user.email} provider={user.method === "apple" ? "Apple" : "Google"} />
        <Field helper="We'll send a 6-digit code to verify your number.">
          <PhoneField country={country} onCountry={setCountry} phone={phone} onPhone={setPhone} />
        </Field>
        <PrimaryButton disabled={!valid} onClick={() => onNext({ country, phone })}>
          Send code <span className="arrow">→</span>
        </PrimaryButton>
        <div className="footnote">
          We use your phone only to send claim status updates. Never for marketing.
        </div>
      </div>
    </div>
  );
}

function CompleteScreenB({ user, onBack, onNext }) {
  const [country, setCountry] = useState(COUNTRIES[0]);
  const [phone, setPhone] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const match = pw && pw === pw2;
  const { score } = scoreStrength(pw);
  const phoneOk = phone.replace(/\D/g, "").length >= 7;
  const canCreate = phoneOk && score >= 2 && match;

  return (
    <div className="auth-app">
      <AuthHero
        title="Secure your account"
        subtitle="Step 2 of 2 · Almost there"
        step={2}
        total={2}
        onBack={onBack}
      />
      <div className="auth-card">
        <Field helper="We'll send a 6-digit code to verify.">
          <PhoneField country={country} onCountry={setCountry} phone={phone} onPhone={setPhone} />
        </Field>

        <Field label="Password">
          <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Create a password" />
          <StrengthMeter password={pw} />
        </Field>

        <Field
          label="Confirm password"
          helper={pw2 ? (match ? "✓ Passwords match" : "✗ Passwords do not match") : null}
          helperKind={pw2 ? (match ? "success" : "error") : ""}
        >
          <PasswordInput value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Re-enter password" />
        </Field>

        <PrimaryButton disabled={!canCreate} onClick={() => onNext({ country, phone, pw })}>
          Create account & send code <span className="arrow">→</span>
        </PrimaryButton>

        <div className="footnote">
          By creating an account you agree to our <a>Terms</a> and authorize Credimed to charge our success fee (15% Standard, 10% Premium) on successful refunds.
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   SCREEN 3 — /signup/verify
   ============================================================ */
function VerifyScreen({ phoneMasked, onBack, onSuccess }) {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [status, setStatus] = useState("idle"); // idle | success | error | loading
  const [attempts, setAttempts] = useState(3);
  const [countdown, setCountdown] = useState(45);
  const refs = useRef([]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  const setDigit = (i, v) => {
    const clean = v.replace(/\D/g, "").slice(0, 1);
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    setStatus("idle");
    if (clean && i < 5) refs.current[i + 1]?.focus();
    // auto-submit when all filled
    if (next.every(d => d !== "")) {
      submit(next.join(""));
    }
  };

  const handleKey = (i, e) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      refs.current[i - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < 5) refs.current[i + 1]?.focus();
  };

  const handlePaste = (e) => {
    const paste = (e.clipboardData || window.clipboardData).getData("text").replace(/\D/g, "").slice(0, 6);
    if (paste.length === 6) {
      e.preventDefault();
      const arr = paste.split("");
      setDigits(arr);
      refs.current[5]?.focus();
      submit(paste);
    }
  };

  const submit = (code) => {
    setStatus("loading");
    setTimeout(() => {
      // demo: "123456" succeeds, anything else errors first time then passes
      if (code === "123456" || Math.random() > 0.3) {
        setStatus("success");
        setTimeout(onSuccess, 600);
      } else {
        setStatus("error");
        setAttempts(a => Math.max(0, a - 1));
        setTimeout(() => {
          setDigits(["", "", "", "", "", ""]);
          setStatus("idle");
          refs.current[0]?.focus();
        }, 900);
      }
    }, 550);
  };

  const resend = () => {
    if (countdown > 0) return;
    setCountdown(45);
  };

  return (
    <div className="auth-app">
      <AuthHero
        title="Enter verification code"
        subtitle={`We sent a code to ${phoneMasked}`}
        onBack={onBack}
        variant="short"
      />
      <div className="auth-card">
        <div className="otp-wrap" onPaste={handlePaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => (refs.current[i] = el)}
              className={`otp-box ${d ? "filled" : ""} ${status === "success" ? "success" : ""} ${status === "error" ? "error" : ""}`}
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => handleKey(i, e)}
              disabled={status === "loading" || status === "success"}
              aria-label={`Digit ${i + 1}`}
            />
          ))}
        </div>

        {status === "error" && (
          <div className="helper error" style={{textAlign:"center", marginBottom: 12}}>
            Invalid code. {attempts} attempts remaining
          </div>
        )}

        <div className="resend-row">
          {countdown > 0 ? (
            <span className="muted">Resend code in 0:{String(countdown).padStart(2, "0")}</span>
          ) : (
            <a className="link-teal" onClick={resend}>Resend code</a>
          )}
        </div>

        <div className="resend-row" style={{marginTop: 12}}>
          Wrong number? <a className="link-teal" onClick={onBack}>Change it</a>
        </div>

        {status === "loading" && (
          <div style={{display:"flex", justifyContent:"center", marginTop: 16}}>
            <div className="dots-spinner" style={{gap:6}}>
              <span style={{background:"var(--teal-600)"}}/>
              <span style={{background:"var(--teal-600)"}}/>
              <span style={{background:"var(--teal-600)"}}/>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   SCREEN 4 — /login
   ============================================================ */
function LoginScreen({ onSignIn, onSignup, onForgot, onOAuth }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const canSignIn = /.+@.+\..+/.test(email) && pw.length >= 6;
  return (
    <div className="auth-app">
      <AuthHero title="Welcome back" subtitle="Sign in to check your claim" />
      <div className="auth-card">
        <OAuthButtons onGoogle={() => onOAuth("google")} onApple={() => onOAuth("apple")} />
        <Divider />
        <Field>
          <TextInput type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field>
          <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" />
        </Field>
        <div style={{textAlign:"right", marginTop:-6, marginBottom: 8}}>
          <a className="link-teal" onClick={onForgot} style={{fontSize:13}}>Forgot password?</a>
        </div>
        <PrimaryButton disabled={!canSignIn} onClick={onSignIn}>
          Sign in <span className="arrow">→</span>
        </PrimaryButton>
        <div className="card-footer">
          New here? <a onClick={onSignup}>Create an account</a>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   SCREEN 5 — /signup/success
   ============================================================ */
function SuccessScreen({ firstName = "John", onDone }) {
  useEffect(() => {
    const t = setTimeout(() => onDone && onDone(), 2000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="auth-app" style={{padding:0}}>
      <div className="success-screen">
        <div className="success-check">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 L9 17 L4 12"/>
          </svg>
        </div>
        <h1 className="success-title">You're in, {firstName} 👋</h1>
        <p className="success-sub">Taking you to your dashboard…</p>
        <div className="dots-spinner">
          <span/><span/><span/>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  SignupScreen, CompleteScreenA, CompleteScreenB, VerifyScreen, LoginScreen, SuccessScreen,
});
