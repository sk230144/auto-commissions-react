import { useState } from "react";
import { KeyRound, LogOut } from "lucide-react";
import { useAuth } from "../lib/auth.jsx";
import * as api from "../lib/api.js";
import { Logo } from "../components/Logo.jsx";

/**
 * Forced when `must_change_password` is set — a fresh onboard, or an admin
 * reset. Nothing else in the app renders until it is done, because the
 * temporary password is known to whoever issued it.
 *
 * Setting your own password clears the flag server-side; `refresh()` then picks
 * up the cleared value and the shell takes over.
 */
export default function ChangePassword() {
  const { me, refresh, signOut } = useAuth();
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const tooShort = pw.length > 0 && pw.length < 4;
  const mismatch = again.length > 0 && pw !== again;
  const ok = pw.length >= 4 && pw === again;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.userSetPassword(me.id, pw);
      await refresh();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="loginwrap">
      <form className="logincard" onSubmit={submit}>
        <div className="loginbrand"><Logo height={30} /></div>
        <h1>Choose a password</h1>
        {/* A full sentence, so it reads left-aligned — centring only suits the
            short one-line subtitle on the sign-in screen. */}
        <p className="loginsub" style={{ textAlign: "left" }}>
          {me?.email} — your account uses a temporary password, so pick your own before
          going any further.
        </p>

        <label className="f" htmlFor="pw">New password</label>
        <input id="pw" type="password" autoComplete="new-password" autoFocus value={pw}
          placeholder="At least 4 characters"
          onChange={(e) => { setPw(e.target.value); setError(""); }} />

        <label className="f" htmlFor="again" style={{ marginTop: 12 }}>Confirm</label>
        <input id="again" type="password" autoComplete="new-password" value={again}
          onChange={(e) => { setAgain(e.target.value); setError(""); }} />

        {(error || tooShort || mismatch) && (
          <div className="loginerr" role="alert">
            {error || (tooShort ? "Use at least 4 characters." : "The two passwords do not match.")}
          </div>
        )}

        <button className="btn pri" type="submit" disabled={!ok || busy}
          style={{ width: "100%", justifyContent: "center", marginTop: 16, padding: "10px 14px" }}>
          <KeyRound size={15} strokeWidth={2} />{busy ? "Saving…" : "Set password"}
        </button>

        <button type="button" className="btn gho" onClick={signOut}
          style={{ width: "100%", justifyContent: "center", marginTop: 8 }}>
          <LogOut size={14} strokeWidth={2} />Sign out instead
        </button>
      </form>
    </div>
  );
}
