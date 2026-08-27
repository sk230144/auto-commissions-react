import { useState } from "react";
import { LogIn, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../lib/auth.jsx";
import { Logo } from "../components/Logo.jsx";

/**
 * Sign in.
 *
 * The credential check runs in the browser against a seeded account, because
 * there is no auth API yet. The banner says so out loud rather than implying a
 * security guarantee this build cannot make.
 */
export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function submit(e) {
    e.preventDefault();
    setBusy(true);
    const err = signIn(email, password);
    setBusy(false);
    // A successful sign-in unmounts this component, so only failure lands here.
    if (err) setError(err);
  }

  return (
    <div className="loginwrap">
      <form className="logincard" onSubmit={submit}>
        <div className="loginbrand"><Logo height={30} /></div>
        <h1>Auto Commissions</h1>
        <p className="loginsub">Sign in to continue.</p>

        <label className="f" htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="username" autoFocus value={email}
          placeholder="you@ourworldenergy.com"
          onChange={(e) => { setEmail(e.target.value); setError(""); }} />

        <label className="f" htmlFor="password" style={{ marginTop: 12 }}>Password</label>
        <div className="pwwrap">
          <input id="password" type={show ? "text" : "password"} autoComplete="current-password"
            value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} />
          <button type="button" className="pwtoggle" onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}>
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>

        {error && <div className="loginerr" role="alert">{error}</div>}

        <button className="btn pri" type="submit" disabled={!email || !password || busy}
          style={{ width: "100%", justifyContent: "center", marginTop: 16, padding: "10px 14px" }}>
          <LogIn size={15} strokeWidth={2} />Sign in
        </button>

        {/* Stated plainly: this build has no server-side auth. */}
        <div className="loginnote">
          <b>Demo sign-in.</b> Accounts live in this browser only — there is no auth server yet,
          so this gates the interface, not the data. Seeded account:{" "}
          <span className="mono">admin@gmail.com</span> / <span className="mono">1234</span>
        </div>
      </form>
    </div>
  );
}
