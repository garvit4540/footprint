import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";

export default function Signup() {
  const { signup } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (password.length < 8) {
      setErr("password must be at least 8 characters");
      return;
    }
    setBusy(true);
    try {
      await signup(email, password, displayName || undefined);
      nav("/", { replace: true });
    } catch (e: any) {
      setErr(e?.message || "signup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-5">
        <div className="text-center">
          <div className="mx-auto w-10 h-10 rounded-full bg-gradient-to-tr from-brand-400 to-accent-pink shadow-glow" />
          <h2 className="mt-4 text-xl font-semibold">Create an account</h2>
          <p className="text-sm text-ink-400">
            Sign up to follow new posts. An admin will grant you access to specific topics.
          </p>
        </div>
        <label className="block space-y-1">
          <div className="field-label">Email</div>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
        </label>
        <label className="block space-y-1">
          <div className="field-label">Display name <span className="text-ink-500 normal-case text-[10px] tracking-normal">(optional)</span></div>
          <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <div className="field-label">Password</div>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          <p className="text-xs text-ink-500">Minimum 8 characters.</p>
        </label>
        {err && <div className="text-sm text-red-400">{err}</div>}
        <button type="submit" className="btn w-full justify-center" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </button>
        <p className="text-xs text-ink-500 text-center">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
