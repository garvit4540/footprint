import { FormEvent, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const from = (loc.state as { from?: string } | null)?.from || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await login(email, password);
      nav(from, { replace: true });
    } catch (e: any) {
      setErr(e?.message || "login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-5">
        <div className="text-center">
          <div className="mx-auto w-10 h-10 rounded-full bg-gradient-to-tr from-brand-400 to-accent-pink shadow-glow" />
          <h2 className="mt-4 text-xl font-semibold">Welcome back</h2>
          <p className="text-sm text-ink-400">Sign in to continue.</p>
        </div>
        <label className="block space-y-1">
          <div className="field-label">Email</div>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
        </label>
        <label className="block space-y-1">
          <div className="field-label">Password</div>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {err && <div className="text-sm text-red-400">{err}</div>}
        <button type="submit" className="btn w-full justify-center" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-xs text-ink-500 text-center">
          New here? <Link to="/signup">Create an account</Link>
        </p>
      </form>
    </div>
  );
}
