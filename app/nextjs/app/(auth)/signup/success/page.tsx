"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthFlow } from "@/components/auth/AuthFlowProvider";

export default function SuccessPage() {
  const router = useRouter();
  const { draft } = useAuthFlow();

  useEffect(() => {
    const t = setTimeout(() => router.push("/dashboard"), 2000);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <div className="success-screen">
      <div className="success-check">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 L9 17 L4 12" />
        </svg>
      </div>
      <h1 className="success-title">You're in, {draft.firstName || "there"} 👋</h1>
      <p className="success-sub">Taking you to your dashboard…</p>
      <div className="dots-spinner"><span /><span /><span /></div>
    </div>
  );
}
