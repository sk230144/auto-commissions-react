import { useMemo, useState } from "react";
import { Search, UserPlus, KeyRound } from "lucide-react";
import { useStore } from "../lib/store.jsx";
import { csvDownload, today } from "../lib/fmt.js";
import { useApi, useDebounced } from "../lib/useApi.js";
import * as api from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { Badge, Async, TableSkeleton, Pager, Modal, Confirm, Tip, SortTh } from "../components/ui.jsx";
import { PageHead } from "../App.jsx";
import { useSortState, sortRows } from "../lib/sort.js";

const LIMIT = 500;   // one full page — the active/suspended split is client-side
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
  const { me, canWrite, refresh } = useAuth();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  // Suspended accounts are kept forever (there is no delete), so the main
  // table would silently fill with dead rows — they live behind their own tab.
  const [view, setView] = useState("active");
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
  // But Access Control is its own permission: a plain Admin holds User
  // Management and NOT the matrix, so this 403s for them. That is expected, not
  // a session problem — hence `quiet`, and hence the fallback below.
  const matrixQ = useApi((signal) => api.accessMatrix({ signal, quiet: true }), []);

  const d = listQ.data;

  /**
   * Super-admin accounts are hidden from everyone who is not one.
   *
   * A super admin is locked open on every page by design, so the row advertises
   * an account that cannot be locked down — and an Admin can edit roles, which
   * makes the list a menu. Own-role accounts stay visible to their peers, who
   * can already act on them.
   *
   * This filters the loaded page rather than the query because /users/list has
   * no "exclude role" parameter. So it is a presentation rule, not a security
   * boundary — the server is what actually refuses the writes. Everything
   * downstream (tabs, counts, chart, export) reads this list, so nothing can
   * disagree about who is on screen.
   */
  const iAmSuper = me?.role === "super_admin";
  const loaded = useMemo(() => {
    const all = d?.users || [];
    return iAmSuper ? all : all.filter((u) => u.role !== "super_admin" || u.you);
  }, [d, iAmSuper]);
  const hiddenSupers = (d?.users?.length || 0) - loaded.length;

  /**
   * The role list, with the matrix as the richer source and the users
   * themselves as the fallback — every row already carries `role` +
   * `role_name`, so the screen still knows its roles when the matrix is out of
   * reach. Without this the role tabs and the by-role chart silently emptied
   * for anyone who is not a super admin.
   *
   * `by_role` is the complete census (it covers the whole table, not the loaded
   * page), so it seeds the keys; names come from whichever user carries them.
   */
  const roles = useMemo(() => {
    const fromMatrix = matrixQ.data?.roles;
    const list = fromMatrix?.length ? fromMatrix : (() => {
      const names = new Map();
      for (const u of loaded) if (u.role && !names.has(u.role)) names.set(u.role, u.role_name || u.role);
      for (const k of Object.keys(d?.by_role || {})) if (!names.has(k)) names.set(k, k);
      return [...names].map(([key, name]) => ({ key, name }));
    })();
    // Hidden rows must not leave a role behind: an empty "Super admin" tab, or
    // a role in the create-user dropdown the server would refuse anyway.
    return iAmSuper ? list : list.filter((r) => r.key !== "super_admin");
  }, [matrixQ.data, loaded, d, iAmSuper]);

  const roleName = (k) => roles.find((r) => r.key === k)?.name || k;
  const roleBlurb = (k) => roles.find((r) => r.key === k)?.description || "";
  const activeN = loaded.filter((u) => u.status !== "suspended").length;
  const suspendedN = loaded.length - activeN;
  // /users/list has no sort parameter — this orders the loaded page.
  const [sort, onSort] = useSortState();
  const rows = sortRows(loaded.filter((u) => (u.status === "suspended") === (view === "suspended")), sort, {
    user: (u) => u.name || u.email,
    // -1 means "all pages"; sorted as larger than any real count.
    page_count: (u) => (u.page_count === -1 ? Number.MAX_SAFE_INTEGER : u.page_count),
  });
  // Whole-table counts — they do not shrink as the list is filtered. When
  // super admins are hidden they come out of these too, or the badges would
  // count rows that are not on screen.
  const total = (d?.total ?? 0) - hiddenSupers;
  const byRole = useMemo(() => {
    const b = d?.by_role || {};
    if (iAmSuper || !hiddenSupers) return b;
    const { super_admin: _hidden, ...rest } = b;
    return rest;
  }, [d, iAmSuper, hiddenSupers]);

  const reset = (fn) => (v) => { fn(v); setOffset(0); };

  async function act(fn, okMsg) {
    setBusy(true);
    try {
      const res = await fn();
      say(okMsg);
      listQ.reload();
      // A role or status change can affect the signed-in user's own access.
      refresh();
      return res ?? { ok: true };
    } catch (e) {
      say(e.message, true);
      return undefined;          // the caller keeps its dialog open on failure
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

        {loaded.length > 0 && <UsersCharts users={loaded} roles={roles} />}

        <div className="card">
          <div className="card-h">
            <div className="seg">
              <button className={view === "active" ? "on" : ""} onClick={() => setView("active")}>
                Active<span className="segn">{activeN}</span>
              </button>
              <button className={view === "suspended" ? "on" : ""} onClick={() => setView("suspended")}>
                Suspended<span className="segn">{suspendedN}</span>
              </button>
            </div>
            <div className="seg">
              <button className={role === "" ? "on" : ""} onClick={() => reset(setRole)("")}>
                All roles<span className="segn">{Object.values(byRole).reduce((a, b) => a + b, 0) || total}</span>
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
              empty={search || role ? "No users match."
                : view === "suspended" ? "No suspended accounts."
                : "No active users yet."}>
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
          onSave={async (body) => {
            const creating = form.mode === "create";
            // The server generates a temporary password and emails it to the
            // new user directly. It is deliberately NOT surfaced here: a
            // password that reaches the admin's screen invites being passed on
            // over chat, and the person who owns the account should be the one
            // who sees it. If the mail never arrives, Password resets it.
            const res = await act(
              () => creating ? api.userOnboard(body) : api.userEdit(body),
              creating
                ? `${body.email} onboarded as ${roleName(body.role)} — an invite email is on its way`
                : "User updated"
            );
            if (!res) return;                        // failed — keep the form open
            setForm(null);
          }} />
      )}

      {pwFor && (
        <PasswordDialog user={pwFor} busy={busy} onCancel={() => setPwFor(null)}
          onOk={(pw) => {
            const u = pwFor; setPwFor(null);
            // Your own row goes through the self endpoint. The admin one does
            // handle "yourself" correctly today (it skips the
            // must_change_password stamp), but that is its courtesy, not its
            // job: changing your own password is what /auth/change-password is
            // for, and it needs no permission to work.
            act(() => u.you ? api.authChangePassword(pw) : api.userSetPassword(u.id, pw),
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
      onClose={onCancel}
      footer={<>
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn pri" disabled={!ok || busy} onClick={() => onOk(pw)}>Set password</button>
      </>}>
      <div style={{ fontSize: 13, marginBottom: 12, color: "var(--ink-2)" }}>{user.email}</div>
      <label className="f">New password *</label>
      <input autoFocus type="password" value={pw} onChange={(e) => setPw(e.target.value)}
        placeholder="At least 4 characters"
        onKeyDown={(e) => e.key === "Enter" && ok && onOk(pw)} />
    </Modal>
  );
}


/**
 * The page's overview, drawn from the full loaded list.
 *
 * Two small charts, chosen by the data's job (and only two — the other obvious
 * candidate, onboarding over time, cannot support a trend yet):
 *   · people by role — identity + a status split, so two validated series
 *     (active/suspended) with a legend AND direct labels; identity never rides
 *     on color alone
 *   · last sign-in — one series over ordered freshness buckets, so one hue and
 *     no legend (the title names the series)
 */
function UsersCharts({ users, roles }) {
  const active = users.filter((u) => u.status !== "suspended");

  // Fixed role order from the matrix — never resorted by count, so a role's
  // position (and its meaning) stays put as numbers change.
  const roleRows = roles.map((r) => {
    const mine = users.filter((u) => u.role === r.key);
    const a = mine.filter((u) => u.status !== "suspended").length;
    return { name: r.name, a, b: mine.length - a, total: mine.length };
  }).filter((r) => r.total > 0);
  const maxRole = Math.max(1, ...roleRows.map((r) => r.total));

  // Freshness buckets over ACTIVE accounts only — a suspended account cannot
  // sign in, so counting it as "never" would misread as an adoption problem.
  const t = today();
  const weekAgo = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
  const buckets = [
    { name: "Today", n: active.filter((u) => u.last_login === t).length },
    { name: "Past 7 days", n: active.filter((u) => u.last_login && u.last_login !== t && u.last_login >= weekAgo).length },
    { name: "Older", n: active.filter((u) => u.last_login && u.last_login < weekAgo).length },
    { name: "Never", n: active.filter((u) => !u.last_login).length },
  ];
  const maxB = Math.max(1, ...buckets.map((b) => b.n));

  return (
    <div className="uchart-cards">
      <div className="card">
        <div className="card-h"><h2>People by role</h2></div>
        <div className="card-b">
          {roleRows.map((r) => (
            <div className="uchart-row" key={r.name}>
              <div className="uchart-name" title={r.name}>{r.name}</div>
              <div className="uchart-track">
                {/* Widths share one scale (the largest role), so bars compare
                    across rows, and the stack splits it between the series. */}
                {r.a > 0 && (
                  <Tip text={`${r.a} active ${r.name.toLowerCase()} account${r.a === 1 ? "" : "s"}`}
                    as="span" className="uchart-seg a"
                    style={{ width: `${(r.a / maxRole) * 100}%` }} />
                )}
                {r.b > 0 && (
                  <Tip text={`${r.b} suspended`} as="span" className="uchart-seg b"
                    style={{ width: `${(r.b / maxRole) * 100}%` }} />
                )}
              </div>
              <div className="uchart-val">{r.total}</div>
            </div>
          ))}
          <div className="uchart-legend">
            <span><span className="sw" style={{ background: "var(--chart-a)" }} />Active</span>
            <span><span className="sw" style={{ background: "var(--chart-b)" }} />Suspended</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-h"><h2>Last sign-in — active accounts</h2></div>
        <div className="card-b">
          {buckets.map((b) => (
            <div className="uchart-row" key={b.name}>
              <div className="uchart-name">{b.name}</div>
              <div className="uchart-track">
                {b.n > 0 && (
                  <Tip text={`${b.n} account${b.n === 1 ? "" : "s"} — last sign-in: ${b.name.toLowerCase()}`}
                    as="span" className="uchart-seg a"
                    style={{ width: `${(b.n / maxB) * 100}%` }} />
                )}
              </div>
              <div className="uchart-val">{b.n}</div>
            </div>
          ))}
          <div className="submeta" style={{ marginTop: 10 }}>
            "Never" means onboarded but not yet signed in — worth a nudge before it becomes a habit.
          </div>
        </div>
      </div>
    </div>
  );
}
