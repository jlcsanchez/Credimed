"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { DEFAULT_COUNTRY, type Country } from "./countries";

export type AuthMethod = "email" | "google" | "apple";

export type AuthDraft = {
  firstName: string;
  lastName: string;
  email: string;
  method: AuthMethod;
  country: Country;
  phone: string;
  password?: string;
};

type Ctx = {
  draft: AuthDraft;
  setDraft: (patch: Partial<AuthDraft>) => void;
  reset: () => void;
};

const initial: AuthDraft = {
  firstName: "",
  lastName: "",
  email: "",
  method: "email",
  country: DEFAULT_COUNTRY,
  phone: "",
};

const AuthFlowCtx = createContext<Ctx | null>(null);

export function AuthFlowProvider({ children }: { children: ReactNode }) {
  const [draft, set] = useState<AuthDraft>(initial);
  const value: Ctx = {
    draft,
    setDraft: (patch) => set((d) => ({ ...d, ...patch })),
    reset: () => set(initial),
  };
  return <AuthFlowCtx.Provider value={value}>{children}</AuthFlowCtx.Provider>;
}

export function useAuthFlow(): Ctx {
  const ctx = useContext(AuthFlowCtx);
  if (!ctx) throw new Error("useAuthFlow must be used inside <AuthFlowProvider>");
  return ctx;
}
