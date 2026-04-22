import "@/styles/tokens.css";
import "@/styles/auth.css";
import { AuthFlowProvider } from "@/components/auth/AuthFlowProvider";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthFlowProvider>
      <div className="auth-app">{children}</div>
    </AuthFlowProvider>
  );
}
