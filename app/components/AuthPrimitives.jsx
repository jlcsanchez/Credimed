/* global React */
const { useState, useRef, useEffect } = React;

/* ============================================================
   SHARED AUTH PRIMITIVES
   ============================================================ */

const COUNTRIES = [
  { code: "+52", flag: "🇲🇽", name: "Mexico" },
  { code: "+1",  flag: "🇺🇸", name: "United States" },
  { code: "+34", flag: "🇪🇸", name: "Spain" },
  { code: "+44", flag: "🇬🇧", name: "United Kingdom" },
  { code: "+54", flag: "🇦🇷", name: "Argentina" },
  { code: "+57", flag: "🇨🇴", name: "Colombia" },
  { code: "+56", flag: "🇨🇱", name: "Chile" },
  { code: "+51", flag: "🇵🇪", name: "Peru" },
  { code: "+55", flag: "🇧🇷", name: "Brazil" },
];

function LogoBadge() {
  return (
    <div className="logo-badge">
      <span className="logo-circle">
        <svg width="18" height="18" viewBox="0 0 32 32">
          <path d="M16 2 C 7 2, 3 7, 3 15 C 3 24, 8 30, 16 30 C 24 30, 29 24, 29 15 C 29 7, 25 2, 16 2 Z M 11 10 L 11 21 M 21 10 L 21 21"
                fill="none" stroke="#0D9488" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="16" cy="15" r="2.5" fill="#0D9488"/>
        </svg>
      </span>
      <span className="logo-text">Credimed</span>
    </div>
  );
}

function BackButton({ onClick }) {
  return (
    <button className="back-btn" onClick={onClick} aria-label="Back">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>
  );
}

function Progress({ step, total, pulse }) {
  return (
    <div className="progress" aria-label={`Step ${step} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => {
        const active = i < step;
        return (
          <div key={i} className={`progress-seg ${active ? "active" : ""} ${active && pulse && i === step - 1 ? "pulse" : ""}`} />
        );
      })}
    </div>
  );
}

function AuthHero({ title, subtitle, step, total, pulse, onBack, variant }) {
  return (
    <div className={`auth-hero ${variant || ""}`}>
      <div className="hero-topbar">
        {onBack ? <BackButton onClick={onBack} /> : <span style={{width:36}}/>}
        <LogoBadge />
        <span style={{width:36}}/>
      </div>
      <h1 className="hero-title">{title}</h1>
      {subtitle && <p className="hero-subtitle">{subtitle}</p>}
      {total ? <Progress step={step} total={total} pulse={pulse} /> : null}
    </div>
  );
}

/* ========== OAuth ========== */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.8 32.5 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.9z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4c-7.7 0-14.4 4.3-17.7 10.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.3 2.4-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.5 39.7 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.2 5.2C41 35.9 44 30.4 44 24c0-1.3-.1-2.7-.4-3.9z"/>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
      <path d="M16.8 12.7c0-2.5 2-3.7 2.1-3.8-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4 1.2-.1 1.7-.8 3.1-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.5-.9-2.5-3.8zM14.4 5.4c.7-.8 1.1-1.9 1-3-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.5z"/>
    </svg>
  );
}

function OAuthButtons({ onGoogle, onApple }) {
  return (
    <>
      <button className="oauth-btn" onClick={onGoogle}>
        <GoogleIcon />
        Continue with Google
      </button>
      <button className="oauth-btn apple" onClick={onApple}>
        <AppleIcon />
        Continue with Apple
      </button>
    </>
  );
}

function Divider({ label = "or" }) {
  return <div className="divider">{label}</div>;
}

/* ========== Inputs ========== */
function Field({ label, children, helper, helperKind }) {
  return (
    <div className="field">
      {label && <label className="field-label">{label}</label>}
      {children}
      {helper && <div className={`helper ${helperKind || ""}`}>{helper}</div>}
    </div>
  );
}

function TextInput(props) {
  return <input className="input" {...props} />;
}

function PasswordInput({ value, onChange, placeholder, id }) {
  const [show, setShow] = useState(false);
  return (
    <div className="input-with-icon">
      <input
        className="input"
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        id={id}
        autoComplete="new-password"
      />
      <button type="button" className="icon-btn" onClick={() => setShow(s => !s)} aria-label={show ? "Hide password" : "Show password"}>
        {show ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
            <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        )}
      </button>
    </div>
  );
}

/* ========== Country / Phone ========== */
function PhoneField({ country, onCountry, phone, onPhone }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    const h = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div className="phone-field" ref={wrapRef}>
      <div className="country-select" onClick={() => setOpen(o => !o)} style={{position:"relative"}}>
        <span className="flag">{country.flag}</span>
        <span>{country.code}</span>
        <svg className="chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
        {open && (
          <div className="country-menu" onClick={(e) => e.stopPropagation()}>
            {COUNTRIES.map(c => (
              <div key={c.code} className={`country-opt ${c.code === country.code ? "selected" : ""}`} onClick={() => { onCountry(c); setOpen(false); }}>
                <span style={{fontSize:16}}>{c.flag}</span>
                <span>{c.name}</span>
                <span className="code">{c.code}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <input
        className="input"
        type="tel"
        inputMode="tel"
        placeholder="WhatsApp number"
        value={phone}
        onChange={(e) => onPhone(e.target.value.replace(/[^0-9\s]/g, ""))}
      />
    </div>
  );
}

/* ========== Banner ========== */
function SuccessBanner({ email, provider }) {
  return (
    <div className="banner-success">
      <span className="check-dot">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </span>
      <span>Signed in as <span className="email">{email}</span> via {provider}</span>
    </div>
  );
}

/* ========== Strength meter ========== */
function scoreStrength(pw) {
  if (!pw) return { score: 0, label: "" };
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const score = Math.min(4, Math.max(1, s));
  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  return { score, label: labels[score] };
}

function StrengthMeter({ password }) {
  const { score, label } = scoreStrength(password);
  const kinds = ["weak", "fair", "good", "strong"];
  const kind = kinds[score - 1] || "";
  return (
    <>
      <div className="strength">
        {[0,1,2,3].map(i => (
          <div key={i} className={`strength-seg ${i < score ? kind : ""}`} />
        ))}
      </div>
      {label && <div className={`strength-label ${kind}`}>{label}</div>}
    </>
  );
}

/* ========== Primary button ========== */
function PrimaryButton({ children, onClick, disabled, full = true }) {
  return (
    <button className="btn-primary" onClick={onClick} disabled={disabled}>
      <span>{children}</span>
    </button>
  );
}

/* Export to window */
Object.assign(window, {
  LogoBadge, BackButton, Progress, AuthHero,
  OAuthButtons, Divider, Field, TextInput, PasswordInput,
  PhoneField, SuccessBanner, StrengthMeter, PrimaryButton,
  COUNTRIES, scoreStrength,
});
