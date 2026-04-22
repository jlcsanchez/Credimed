"use client";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  step?: number;
  total?: number;
  pulse?: boolean;
  showBack?: boolean;
  backHref?: string;
  variant?: "default" | "short" | "compact";
};

export function AuthHero({
  title,
  subtitle,
  step,
  total,
  pulse,
  showBack,
  backHref,
  variant = "default",
}: Props) {
  const router = useRouter();
  return (
    <div className={`auth-hero ${variant !== "default" ? variant : ""}`}>
      <div className="hero-topbar">
        {showBack ? (
          <button
            className="back-btn"
            aria-label="Back"
            onClick={() => (backHref ? router.push(backHref) : router.back())}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        ) : (
          <span style={{ width: 36 }} />
        )}
        <LogoBadge />
        <span style={{ width: 36 }} />
      </div>
      <h1 className="hero-title">{title}</h1>
      {subtitle && <p className="hero-subtitle">{subtitle}</p>}
      {total ? <Progress step={step ?? 1} total={total} pulse={pulse} /> : null}
    </div>
  );
}

function LogoBadge() {
  return (
    <div className="logo-badge">
      <span className="logo-circle">
        <svg width="18" height="18" viewBox="0 0 32 32">
          <path
            d="M16 2 C 7 2, 3 7, 3 15 C 3 24, 8 30, 16 30 C 24 30, 29 24, 29 15 C 29 7, 25 2, 16 2 Z M 11 10 L 11 21 M 21 10 L 21 21"
            fill="none"
            stroke="#0D9488"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="16" cy="15" r="2.5" fill="#0D9488" />
        </svg>
      </span>
      <span className="logo-text">Credimed</span>
    </div>
  );
}

function Progress({ step, total, pulse }: { step: number; total: number; pulse?: boolean }) {
  return (
    <div className="progress" aria-label={`Step ${step} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => {
        const active = i < step;
        const isCurrent = i === step - 1;
        return (
          <div
            key={i}
            className={[
              "progress-seg",
              active ? "active" : "",
              active && pulse && isCurrent ? "pulse" : "",
            ].join(" ").trim()}
          />
        );
      })}
    </div>
  );
}

export default AuthHero;
