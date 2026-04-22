"use client";
import { useEffect, useRef, useState } from "react";
import { COUNTRIES, type Country } from "./countries";

type Props = {
  country: Country;
  onCountry: (c: Country) => void;
  phone: string;
  onPhone: (v: string) => void;
  placeholder?: string;
};

export function PhoneField({
  country,
  onCountry,
  phone,
  onPhone,
  placeholder = "WhatsApp number",
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="phone-field" ref={wrapRef}>
      <div
        className="country-select"
        onClick={() => setOpen((o) => !o)}
        style={{ position: "relative" }}
      >
        <span className="flag">{country.flag}</span>
        <span>{country.code}</span>
        <svg
          className="chev"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        {open && (
          <div className="country-menu" onClick={(e) => e.stopPropagation()}>
            {COUNTRIES.map((c) => (
              <div
                key={c.code}
                className={`country-opt ${c.code === country.code ? "selected" : ""}`}
                onClick={() => {
                  onCountry(c);
                  setOpen(false);
                }}
              >
                <span style={{ fontSize: 16 }}>{c.flag}</span>
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
        placeholder={placeholder}
        value={phone}
        onChange={(e) => onPhone(e.target.value.replace(/[^0-9\s]/g, ""))}
      />
    </div>
  );
}
