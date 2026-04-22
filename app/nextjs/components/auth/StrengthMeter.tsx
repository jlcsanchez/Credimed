export type StrengthKind = "weak" | "fair" | "good" | "strong";
export type StrengthResult = { score: 0 | 1 | 2 | 3 | 4; label: "" | Capitalize<StrengthKind> };

export function scoreStrength(pw: string): StrengthResult {
  if (!pw) return { score: 0, label: "" };
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const score = Math.min(4, Math.max(1, s)) as 1 | 2 | 3 | 4;
  const labels = ["", "Weak", "Fair", "Good", "Strong"] as const;
  return { score, label: labels[score] };
}

export function StrengthMeter({ password }: { password: string }) {
  const { score, label } = scoreStrength(password);
  const kinds: StrengthKind[] = ["weak", "fair", "good", "strong"];
  const kind = kinds[score - 1] ?? "";
  return (
    <>
      <div className="strength">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`strength-seg ${i < score ? kind : ""}`} />
        ))}
      </div>
      {label && <div className={`strength-label ${kind}`}>{label}</div>}
    </>
  );
}
