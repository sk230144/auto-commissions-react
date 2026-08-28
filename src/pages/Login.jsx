import { useState } from "react";
import { LogIn, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../lib/auth.jsx";
import { Logo } from "../components/Logo.jsx";

/**
 * Sign in. The server decides — a wrong email and a wrong password return the
 * same message deliberately, so the form cannot be used to discover which
 * addresses exist. That message is shown verbatim rather than reworded.
 */
export default function Login() {
  const { signIn, authError, setAuthError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const err = await signIn(email, password);
    setBusy(false);
    // On success this component unmounts, so only a failure lands here.
    if (err) setError(err);
  }

  const clear = (fn) => (e) => { fn(e.target.value); setError(""); setAuthError(""); };

  return (
    <div className="loginwrap">
      <form className="logincard" onSubmit={submit}>
        <div className="loginbrand"><Logo height={30} /></div>
        <h1>Auto Commissions</h1>
        <p className="loginsub">Sign in to continue.</p>

        {/* Why the last session ended — an expired token or a suspension. */}
        {authError && !error && <div className="loginerr" role="status">{authError}</div>}

        <label className="f" htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="username" autoFocus value={email}
          placeholder="you@ourworldenergy.com" onChange={clear(setEmail)} />

        <label className="f" htmlFor="password" style={{ marginTop: 12 }}>Password</label>
        <div className="pwwrap">
          <input id="password" type={show ? "text" : "password"} autoComplete="current-password"
            value={password} onChange={clear(setPassword)} />
          <button type="button" className="pwtoggle" onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}>
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>

        {error && <div className="loginerr" role="alert">{error}</div>}

        <button className="btn pri" type="submit" disabled={!email || !password || busy}
          style={{ width: "100%", justifyContent: "center", marginTop: 16, padding: "10px 14px" }}>
          <LogIn size={15} strokeWidth={2} />{busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
