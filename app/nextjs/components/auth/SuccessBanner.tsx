type Props = {
  email: string;
  provider: "Google" | "Apple";
};

export function SuccessBanner({ email, provider }: Props) {
  return (
    <div className="banner-success">
      <span className="check-dot">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
      <span>
        Signed in as <span className="email">{email}</span> via {provider}
      </span>
    </div>
  );
}
