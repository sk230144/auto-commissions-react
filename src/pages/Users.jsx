import { useState } from "react";
import { Search, UserPlus, KeyRound } from "lucide-react";
import { useStore } from "../lib/store.jsx";
import { csvDownload } from "../lib/fmt.js";
import { useApi, useDebounced } from "../lib/useApi.js";
import * as api from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { Badge, Async, TableSkeleton, Pager, Modal, Confirm, Tip, SortTh } from "../components/ui.jsx";
import { PageHead } from "../App.jsx";
import { useSortState, sortRows } from "../lib/sort.js";

const LIMIT = 25;
const ROLE_TONE = { super_admin: "ok", admin: "blue", operations: "mut", approver: "warn", auditor: "mut" };

/**
 * User Management — who exists, what role they hold, whether they can sign in.
 *
 * Roles are the unit of permission: which pages a role reaches is set once in
 * Access Control, not per person, so two people doing the same job cannot
 * silently drift apart.
 */
export default function Users() {
  const { say } = useStore();
  const { canWrite, refresh } = useAuth();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [offset, setOffset] = useState(0);
  const [form, setForm] = useState(null);
  const [pwFor, setPwFor] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const search = useDebounced(q, 350);
  const mayWrite = canWrite("users");

  const listQ = useApi(
    (signal) => api.usersList({ role, search, limit: LIMIT, offset }, { signal }),
    [role, search, offset]
  );

  // Roles come from the access matrix, so this screen never hardcodes the set.
  const matrixQ = useApi((signal) => api.accessMatrix({ signal }), []);
  const roles = matrixQ.data?.roles || [];
  const roleName = (k) => roles.find((r) => r.key === k)?.name || k;
  const roleBlurb = (k) => roles.find((r) => r.key === k)?.description || "";

  const d = listQ.data;
  // /users/list has no sort parameter — this orders the loaded page.
  const [sort, onSort] = useSortState();
  const rows = sortRows(d?.users || [], sort, {
    user: (u) => u.name || u.email,
    // -1 means "all pages"; sorted as larger than any real count.
    page_count: (u) => (u.page_count === -1 ? Number.MAX_SAFE_INTEGER : u.page_count),
  });
  const total = d?.total ?? 0;
  // Whole-table counts — they do not shrink as the list is filtered.
  const byRole = d?.by_role || {};

  const reset = (fn) => (v) => { fn(v); setOffset(0); };

  async function act(fn, okMsg) {
    setBusy(true);
    try {
      await fn();
      say(okMsg);
      listQ.reload();
      // A role or status change can affect the signed-in user's own access.
      refresh();
    } catch (e) {
      say(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const header = ["Email", "Name", "Role", "Status", "Pages", "Created by", "Created", "Last login"];
    const body = rows.map((u) => [u.email, u.name || "", u.role_name, u.status,
      u.page_count === -1 ? "all" : u.page_count, u.created_by || "", u.created_at || "", u.last_login || ""]);
    csvDownload("users", header, body) ? say("Exported") : say("Nothing to export", true);
  }

  return (
    <>
      <PageHead eyebrow="Admin" title="User Management"
        count={listQ.loading ? "loading…" : listQ.error ? "—"
          : `${total.toLocaleString()} user${total === 1 ? "" : "s"}`}>
        <button className="btn" onClick={exportCsv} disabled={!rows.length}>Export CSV</button>
        {mayWrite && (
          <button className="btn pri" onClick={() => setForm({
            mode: "create", email: "", name: "", role: "operations",
          })}>
            <UserPlus size={14} strokeWidth={2} />Onboard a user
          </button>
        )}
      </PageHead>

      <div className="pagebody">
        <div className="sub">
          Everyone who can sign in. <b>Role decides what they see</b> — the page-by-page grants
          live in Access Control, so changing a role changes access everywhere at once, and
          applies to the person's current session immediately. Accounts are <b>suspended, never
          deleted</b>, so past work keeps its author.
        </div>

        <div className="card">
          <div className="card-h">
            <div className="seg">
              <button className={role === "" ? "on" : ""} onClick={() => reset(setRole)("")}>
                All<span className="segn">{Object.values(byRole).reduce((a, b) => a + b, 0) || total}</span>
              </button>
              {roles.filter((r) => byRole[r.key]).map((r) => (
                <button key={r.key} className={role === r.key ? "on" : ""} onClick={() => reset(setRole)(r.key)}>
                  {r.name}<span className="segn">{byRole[r.key]}</span>
                </button>
              ))}
            </div>
            <div className="sp" />
            <div className="search" style={{ width: 220 }}>
              <span className="mag"><Search size={14} strokeWidth={2} /></span>
              <input placeholder="Name or email…" value={q} onChange={(e) => reset(setQ)(e.target.value)} />
            </div>
          </div>

          <div className="card-b flush">
            <Async q={listQ} what="users" isEmpty={!rows.length}
              skeleton={<TableSkeleton cols={5} />}
              empty={search || role ? "No users match." : "No users yet."}>
              <div className={"tblwrap" + (listQ.refreshing || busy ? " refreshing" : "")}>
                <table>
                  <thead>
                    <tr>
                      <SortTh k="user" sort={sort} onSort={onSort} pageOnly>User</SortTh>
                      <SortTh k="role_name" sort={sort} onSort={onSort} pageOnly>Role</SortTh>
                      <SortTh k="page_count" sort={sort} onSort={onSort} className="r" pageOnly>Pages</SortTh>
                      <SortTh k="status" sort={sort} onSort={onSort} pageOnly>Status</SortTh>
                      <SortTh k="last_login" sort={sort} onSort={onSort} pageOnly>Last login</SortTh>
                      <th /></tr>
                  </thead>
                  <tbody>
                    {rows.map((u) => {
                      const suspended = u.status === "suspended";
                      return (
                        <tr key={u.id}>
                          <td>
                            <b>{u.name || u.email.split("@")[0]}</b>
                            {u.you && <> <Badge kind="blue">you</Badge></>}
                            <div className="submeta">{u.email}</div>
                          </td>
                          <td>
                            <Tip text={roleBlurb(u.role)}>
                              <Badge kind={ROLE_TONE[u.role] || "mut"}>{u.role_name}</Badge>
                            </Tip>
                          </td>
                          <td className="r num">
                            {/* -1 means every page — the super admin is locked open. */}
                            {u.page_count === -1
                              ? <Tip text="A super admin always holds every permission — that is deliberate, so a configuration slip cannot lock out the last administrator.">all</Tip>
                              : u.page_count}
                          </td>
                          <td>
                            <Badge kind={suspended ? "bad" : "ok"}>
                              <span className="pip" />{suspended ? "suspended" : "active"}
                            </Badge>
                          </td>
                          <td>
                            {u.last_login || <span className="gap">never</span>}
                            {u.created_by && <div className="submeta">added by {u.created_by.split("@")[0]}</div>}
                          </td>
                          <td className="r">
                            {mayWrite && (
                              <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: 6 }}>
                                <button className="btn sm" disabled={busy} onClick={() => setForm({
                                  mode: "edit", id: u.id, email: u.email, name: u.name || "", role: u.role,
                                })}>Edit</button>
                                <button className="btn sm" disabled={busy} onClick={() => setPwFor(u)}>
                                  <KeyRound size={12} strokeWidth={2} />Password
                                </button>
                                {/* Refused server-side too; disabling it just avoids
                                    offering an action that cannot succeed. */}
                                {u.you ? (
                                  <Tip text="You cannot suspend your own account.">
                                    <button className="btn sm" disabled>Suspend</button>
                                  </Tip>
                                ) : suspended ? (
                                  <button className="btn sm" disabled={busy}
                                    onClick={() => act(() => api.userActivate(u.id), "Access restored")}>
                                    Restore
                                  </button>
                                ) : (
                                  <button className="btn sm danger" disabled={busy} onClick={() => setConfirm({
                                    title: "Suspend this account?",
                                    body: <>Suspend <b>{u.email}</b>? They are signed out on their next request,
                                      and the account is kept so their past work keeps its author.</>,
                                    confirmLabel: "Suspend", danger: true,
                                    onYes: () => { setConfirm(null); act(() => api.userSuspend(u.id), "Access suspended"); },
                                  })}>Suspend</button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pager total={total} limit={LIMIT} offset={offset} onOffset={setOffset} busy={listQ.refreshing} />
            </Async>
          </div>
        </div>
      </div>

      {form && (
        <UserDialog form={form} setForm={setForm} roles={roles} busy={busy}
          roleName={roleName} roleBlurb={roleBlurb}
          onSave={(body) => act(
            () => form.mode === "create" ? api.userOnboard(body) : api.userEdit(body),
            form.mode === "create" ? `${body.email} onboarded as ${roleName(body.role)}` : "User updated"
          ).then(() => setForm(null))} />
      )}

      {pwFor && (
        <PasswordDialog user={pwFor} busy={busy} onCancel={() => setPwFor(null)}
          onOk={(pw) => {
            const u = pwFor; setPwFor(null);
            act(() => api.userSetPassword(u.id, pw),
              u.you ? "Password changed" : "Password reset — they must choose a new one at next sign-in");
          }} />
      )}

      {confirm && <Confirm {...confirm} onNo={() => setConfirm(null)} />}
    </>
  );
}

/** Onboarding and editing share one dialog; the role list comes from the API. */
function UserDialog({ form, setForm, roles, onSave, roleBlurb, busy }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const creating = form.mode === "create";
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
  const ok = emailOk;

  const chosen = roles.find((r) => r.key === form.role);

  return (
    <Modal title={creating ? "Onboard a user" : `Edit ${form.email}`}
      why={creating
        ? "They are emailed an invite with a one-time password, and must choose their own before reaching the app."
        : "A role change applies to their current session immediately — no sign-out needed."}
      onClose={() => setForm(null)}
      footer={<>
        {!ok && (
          <span className="submeta" style={{ color: "var(--held)", marginRight: "auto" }}>
            A valid email is required.
          </span>
        )}
        <button className="btn" onClick={() => setForm(null)}>Cancel</button>
        <button className="btn pri" disabled={!ok || busy}
          onClick={() => onSave(creating
            // No password crosses the wire from here — the server generates a
            // one-time password and emails the invite.
            ? { email: form.email.trim(), name: form.name.trim(), role: form.role }
            : { id: form.id, name: form.name.trim(), role: form.role })}>
          {creating ? "Onboard" : "Save"}
        </button>
      </>}>
      <div className="grid">
        <div>
          <label className="f">Email *</label>
          <input autoFocus={creating} type="email" value={form.email} disabled={!creating}
            placeholder="name@ourworldenergy.com" onChange={set("email")} />
          {/* Deliberate server-side: history stays attached to the address. */}
          {!creating && <div className="submeta">The email is the identity and cannot be changed. To correct one, suspend this account and onboard the right address.</div>}
        </div>
        <div>
          <label className="f">Name</label>
          <input value={form.name} placeholder="How they appear in the app" onChange={set("name")} />
        </div>
        <div>
          <label className="f">Role *</label>
          <select value={form.role} onChange={set("role")}>
            {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
          </select>
        </div>
      </div>

      {chosen && (
        <div className="submeta" style={{ marginTop: 10 }}>
          {roleBlurb(form.role)}
          {" · "}{chosen.page_count === 16 && chosen.is_system ? "every page" : `${chosen.page_count} pages`}
          {chosen.read_only && " · view only, cannot change anything"}
        </div>
      )}
    </Modal>
  );
}

function PasswordDialog({ user, onOk, onCancel, busy }) {
  const [pw, setPw] = useState("");
  const ok = pw.length >= 4;
  return (
    <Modal title="Set a password"
      why={user.you
        ? "Changing your own password does not sign you out."
        : "Resetting someone else's password forces them to choose their own at the next sign-in."}
      onClose={onCancel}>
      <div style={{ fontSize: 13, marginBottom: 12, color: "var(--ink-2)" }}>{user.email}</div>
      <label className="f">New password *</label>
      <input autoFocus type="password" value={pw} onChange={(e) => setPw(e.target.value)}
        placeholder="At least 4 characters"
        onKeyDown={(e) => e.key === "Enter" && ok && onOk(pw)} />
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn pri" disabled={!ok || busy} onClick={() => onOk(pw)}>Set password</button>
      </div>
    </Modal>
  );
}
