import { useMemo, useState } from "react";
import { Search, UserPlus, KeyRound } from "lucide-react";
import { useStore } from "../lib/store.jsx";
import { csvDownload, trunc } from "../lib/fmt.js";
import { useAuth, ROLES, ROLE_LABEL, ROLE_BLURB, ROLE_PAGES, PAGE_LABEL, PAGE_KEYS } from "../lib/auth.jsx";
import { Badge, Empty, Modal, Confirm, Tip } from "../components/ui.jsx";
import { PageHead } from "../App.jsx";

const ROLE_TONE = { super_admin: "ok", admin: "blue", ops: "mut", approver: "warn", auditor: "mut", dealer: "mut", rep: "mut" };

/**
 * User Management — who exists, what role they hold, and whether they can sign
 * in. Roles are the unit of permission; which pages a role reaches is set once
 * in Access Control rather than per person, so two people with the same job
 * cannot silently end up with different access.
 */
export default function Users() {
  const { say } = useStore();
  const { me, users, setUsers, grants } = useAuth();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [pwFor, setPwFor] = useState(null);

  const rows = useMemo(() => users.filter((u) => {
    if (role && u.role !== role) return false;
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return [u.email, u.name, u.role].join(" ").toLowerCase().includes(s);
  }), [users, q, role]);

  const counts = useMemo(() => {
    const c = {};
    users.forEach((u) => { c[u.role] = (c[u.role] || 0) + 1; });
    return c;
  }, [users]);

  const isSelf = (u) => u.email.toLowerCase() === me?.email.toLowerCase();
  const admins = users.filter((u) => u.role === "super_admin" && u.status !== "suspended");
  /** Guards the last way back in: never remove or demote the final super admin. */
  const isLastAdmin = (u) => u.role === "super_admin" && admins.length <= 1;

  function save(row, mode) {
    const email = row.email.trim().toLowerCase();
    if (mode === "create" && users.some((u) => u.email.toLowerCase() === email)) {
      return say("That email already has an account", true);
    }
    setUsers((list) => mode === "create"
      ? [{ ...row, email, status: "active" }, ...list]
      : list.map((u) => u.email.toLowerCase() === email ? { ...u, ...row, email } : u));
    setForm(null);
    say(mode === "create" ? `${email} onboarded as ${ROLE_LABEL[row.role]}` : "User updated");
  }

  function setStatus(u, status) {
    setUsers((list) => list.map((x) => x.email === u.email ? { ...x, status } : x));
    say(status === "active" ? "Access restored" : "Access suspended");
  }

  function remove(u) {
    setUsers((list) => list.filter((x) => x.email !== u.email));
    setConfirm(null);
    say("Removed");
  }

  function exportCsv() {
    const header = ["Email", "Name", "Role", "Status", "Pages"];
    const body = rows.map((u) => [u.email, u.name || "", u.role, u.status || "active",
      u.role === "super_admin" ? PAGE_KEYS.length : (grants[u.role] || []).length]);
    csvDownload("users", header, body) ? say("Exported") : say("Nothing to export", true);
  }

  return (
    <>
      <PageHead eyebrow="Admin" title="User Management"
        count={`${users.length} user${users.length === 1 ? "" : "s"}`}>
        <button className="btn" onClick={exportCsv} disabled={!rows.length}>Export CSV</button>
        <button className="btn pri" onClick={() => setForm({
          mode: "create", email: "", name: "", role: "ops", password: "",
        })}>
          <UserPlus size={14} strokeWidth={2} />Onboard a user
        </button>
      </PageHead>

      <div className="pagebody">
        <div className="sub">
          Everyone who can sign in. <b>Role decides what they see</b> — the page-by-page grants
          live in Access Control, so changing a role changes access everywhere at once.
          Suspending keeps the account and its history but blocks sign-in.
        </div>

        <div className="card">
          <div className="card-h">
            <div className="seg">
              <button className={role === "" ? "on" : ""} onClick={() => setRole("")}>
                All<span className="segn">{users.length}</span>
              </button>
              {ROLES.filter((r) => counts[r]).map((r) => (
                <button key={r} className={role === r ? "on" : ""} onClick={() => setRole(r)}>
                  {ROLE_LABEL[r]}<span className="segn">{counts[r]}</span>
                </button>
              ))}
            </div>
            <div className="sp" />
            <div className="search" style={{ width: 220 }}>
              <span className="mag"><Search size={14} strokeWidth={2} /></span>
              <input placeholder="Email, name, role…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>

          <div className="card-b flush">
            {rows.length === 0 ? (
              <Empty>{q || role ? "No users match." : "No users yet."}</Empty>
            ) : (
              <div className="tblwrap">
                <table>
                  <thead>
                    <tr><th>User</th><th>Role</th><th className="r">Pages</th><th>Status</th><th /></tr>
                  </thead>
                  <tbody>
                    {rows.map((u) => {
                      const pages = u.role === "super_admin" ? PAGE_KEYS : (grants[u.role] || []);
                      const suspended = u.status === "suspended";
                      return (
                        <tr key={u.email}>
                          <td>
                            <b>{u.name || u.email.split("@")[0]}</b>
                            {isSelf(u) && <> <Badge kind="blue">you</Badge></>}
                            <div className="submeta">{u.email}</div>
                          </td>
                          <td>
                            <Tip text={ROLE_BLURB[u.role]}>
                              <Badge kind={ROLE_TONE[u.role] || "mut"}>{ROLE_LABEL[u.role] || u.role}</Badge>
                            </Tip>
                          </td>
                          <td className="r num">
                            {u.role === "super_admin"
                              ? <Tip text="A super admin always sees every page — that is deliberate, so a configuration slip cannot lock out the last administrator.">
                                  all
                                </Tip>
                              : pages.length}
                          </td>
                          <td>
                            <Badge kind={suspended ? "bad" : "ok"}>
                              <span className="pip" />{suspended ? "suspended" : "active"}
                            </Badge>
                          </td>
                          <td className="r">
                            <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: 6 }}>
                              <button className="btn sm" onClick={() => setForm({
                                mode: "edit", email: u.email, name: u.name || "", role: u.role, password: "",
                              })}>Edit</button>
                              <button className="btn sm" onClick={() => setPwFor(u)}>
                                <KeyRound size={12} strokeWidth={2} />Password
                              </button>
                              {/* The last super admin cannot be suspended or removed —
                                  that is the only way back into Access Control. */}
                              {isLastAdmin(u) ? (
                                <Tip text="The last super admin cannot be suspended or removed — it is the only way back into Access Control.">
                                  <button className="btn sm" disabled>Locked</button>
                                </Tip>
                              ) : (
                                <>
                                  <button className="btn sm" onClick={() => setStatus(u, suspended ? "active" : "suspended")}>
                                    {suspended ? "Restore" : "Suspend"}
                                  </button>
                                  <button className="btn sm danger" onClick={() => setConfirm({
                                    title: "Remove this user?",
                                    body: <>Remove <b>{u.email}</b>? They lose access immediately.
                                      {isSelf(u) && <div style={{ marginTop: 8, color: "var(--held)" }}>
                                        This is your own account — you will be signed out.
                                      </div>}</>,
                                    confirmLabel: "Remove", danger: true,
                                    onYes: () => remove(u),
                                  })}>Remove</button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {form && <UserDialog form={form} setForm={setForm} onSave={save} grants={grants} />}
      {pwFor && <PasswordDialog user={pwFor} onCancel={() => setPwFor(null)}
        onOk={(pw) => {
          setUsers((list) => list.map((x) => x.email === pwFor.email ? { ...x, password: pw } : x));
          setPwFor(null); say("Password set");
        }} />}
      {confirm && <Confirm {...confirm} onNo={() => setConfirm(null)} />}
    </>
  );
}

/**
 * Onboarding and editing share one dialog. Picking a role previews exactly
 * which pages that person will get, so the consequence of the choice is
 * visible before it is made rather than discovered later.
 */
function UserDialog({ form, setForm, onSave, grants }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const creating = form.mode === "create";
  const pages = form.role === "super_admin" ? PAGE_KEYS : (grants[form.role] || ROLE_PAGES[form.role] || []);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
  const pwOk = !creating || form.password.length >= 4;
  const ok = emailOk && pwOk;

  return (
    <Modal wide title={creating ? "Onboard a user" : `Edit ${form.email}`}
      why={creating
        ? "Creates an account that can sign in immediately. Role decides what they see."
        : "Changing the role changes what this person can reach, everywhere at once."}
      onClose={() => setForm(null)}
      footer={<>
        {!ok && (
          <span className="submeta" style={{ color: "var(--held)", marginRight: "auto" }}>
            {!emailOk ? "A valid email is required." : "Password must be at least 4 characters."}
          </span>
        )}
        <button className="btn" onClick={() => setForm(null)}>Cancel</button>
        <button className="btn pri" disabled={!ok}
          onClick={() => onSave({
            email: form.email, name: form.name.trim(), role: form.role,
            ...(form.password ? { password: form.password } : {}),
          }, form.mode)}>
          {creating ? "Onboard" : "Save"}
        </button>
      </>}>
      <div className="grid">
        <div>
          <label className="f">Email *</label>
          <input autoFocus={creating} type="email" value={form.email} disabled={!creating}
            placeholder="name@ourworldenergy.com" onChange={set("email")} />
          {!creating && <div className="submeta">The email is the identity — it cannot be changed.</div>}
        </div>
        <div>
          <label className="f">Name</label>
          <input value={form.name} placeholder="How they appear in the app" onChange={set("name")} />
        </div>
        {creating && (
          <div>
            <label className="f">Temporary password *</label>
            <input value={form.password} onChange={set("password")} placeholder="At least 4 characters" />
          </div>
        )}
      </div>

      <div className="sect">Role</div>
      <div className="rolepick">
        {ROLES.map((r) => (
          <button key={r} type="button" className={"rolecard" + (form.role === r ? " on" : "")}
            onClick={() => setForm({ ...form, role: r })}>
            <div className="t">{ROLE_LABEL[r]}</div>
            <div className="c">{ROLE_BLURB[r]}</div>
          </button>
        ))}
      </div>

      {/* The consequence of the role choice, shown before it is committed. */}
      <div className="sect">This role can reach {form.role === "super_admin" ? "every page" : `${pages.length} pages`}</div>
      <div className="pagechips">
        {(form.role === "super_admin" ? PAGE_KEYS : pages).map((k) => (
          <span key={k} className="pagechip">{PAGE_LABEL[k] || k}</span>
        ))}
        {pages.length === 0 && form.role !== "super_admin" && (
          <span className="submeta">No pages granted — this person would sign in and see nothing.</span>
        )}
      </div>
    </Modal>
  );
}

function PasswordDialog({ user, onOk, onCancel }) {
  const [pw, setPw] = useState("");
  const ok = pw.length >= 4;
  return (
    <Modal title="Set a password"
      why="Replaces the existing password immediately. In a real deployment this would send a reset link instead of setting one directly."
      onClose={onCancel}>
      <div style={{ fontSize: 13, marginBottom: 12, color: "var(--ink-2)" }}>{user.email}</div>
      <label className="f">New password *</label>
      <input autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 4 characters"
        onKeyDown={(e) => e.key === "Enter" && ok && onOk(pw)} />
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn pri" disabled={!ok} onClick={() => onOk(pw)}>Set password</button>
      </div>
    </Modal>
  );
}
