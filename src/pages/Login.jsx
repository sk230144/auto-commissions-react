import { useState } from "react";
import { LogIn, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../lib/auth.jsx";
import { Logo } from "../components/Logo.jsx";
import LoginBackdrop from "../components/LoginBackdrop.jsx";

const REMEMBER_KEY = "ac.remember";
/**
 * The last email that signed in successfully, so the field is pre-filled next
 * time. Only ever the address — a password is never stored here.
 *
 * It is written on SUCCESS, not on submit: remembering an address that was
 * rejected would helpfully pre-fill a typo forever.
 */
const EMAIL_KEY = "ac.email";

/**
 * Sign in. The server decides — a wrong email and a wrong password return the
 * same message deliberately, so the form cannot be used to discover which
 * addresses exist. That message is shown verbatim rather than reworded.
 */
export default function Login() {
  const { signIn, authError, setAuthError } = useAuth();
  const [email, setEmail] = useState(() => {
    try { return localStorage.getItem(EMAIL_KEY) || ""; } catch { return ""; }
  });
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // The choice itself is remembered, so someone on a shared machine does not
  // have to untick it every time.
  const [remember, setRemember] = useState(() => {
    try { return localStorage.getItem(REMEMBER_KEY) !== "0"; } catch { return true; }
  });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try { localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0"); } catch { /* ignore */ }
    const err = await signIn(email, password, remember);

    try {
      // Only a successful address is kept, and only when the box is ticked —
      // unticking is a request not to be remembered on this machine, which has
      // to include the email, not just the token.
      if (!err && remember) localStorage.setItem(EMAIL_KEY, email.trim());
      else if (!remember) localStorage.removeItem(EMAIL_KEY);
    } catch { /* private mode */ }

    setBusy(false);
    // On success this component unmounts, so only a failure lands here.
    if (err) setError(err);
  }

  const clear = (fn) => (e) => { fn(e.target.value); setError(""); setAuthError(""); };

  return (
    <div className="loginwrap">
      <LoginBackdrop />
      <form className="logincard" onSubmit={submit}>
        <div className="loginbrand"><Logo height={30} /></div>
        <h1>Auto Commissions</h1>
        <p className="loginsub">Sign in to continue.</p>

        {/* Why the last session ended — an expired token or a suspension. */}
        {authError && !error && <div className="loginerr" role="status">{authError}</div>}

        <label className="f" htmlFor="email">Email</label>
        {/* When the email is already filled in, the cursor belongs in the
            password field — the remembered address is not what needs typing. */}
        <input id="email" type="email" autoComplete="username" autoFocus={!email} value={email}
          placeholder="you@ourworldenergy.com" onChange={clear(setEmail)} />

        <label className="f" htmlFor="password" style={{ marginTop: 12 }}>Password</label>
        <div className="pwwrap">
          <input id="password" type={show ? "text" : "password"} autoComplete="current-password"
            autoFocus={!!email} value={password} onChange={clear(setPassword)} />
          <button type="button" className="pwtoggle" onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}>
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>

        <label className="remember">
          {/* Unticking forgets the stored email immediately, not at the next
              submit — someone who unticks and walks away has still asked not to
              be remembered on this machine. */}
          <input type="checkbox" checked={remember} onChange={(e) => {
            setRemember(e.target.checked);
            if (!e.target.checked) { try { localStorage.removeItem(EMAIL_KEY); } catch { /* ignore */ } }
          }} />
          <span>
            Keep me signed in
            {/* Says what it actually does, since the alternative is a session
                that ends with the tab rather than one that never ends. */}
            <span className="submeta">
              {remember
                ? "Stays signed in on this browser until the session expires, and fills in your email next time."
                : "Signs out when this tab is closed, and does not keep your email."}
            </span>
          </span>
        </label>

        {error && <div className="loginerr" role="alert">{error}</div>}

        <button className="btn pri" type="submit" disabled={!email || !password || busy}
          style={{ width: "100%", justifyContent: "center", marginTop: 16, padding: "10px 14px" }}>
          <LogIn size={15} strokeWidth={2} />{busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
