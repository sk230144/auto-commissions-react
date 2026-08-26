import { useState } from "react";
import { useStore } from "../lib/store.jsx";
import { Badge, Empty, Confirm } from "../components/ui.jsx";
import { PageHead } from "../App.jsx";
import FilterPanel, { facet, activeCount, passesFilter } from "../components/FilterPanel.jsx";
import { ROLES, ALL_TABS } from "../data/dummy.js";

const FILTER_GROUPS = [{ key: "role", label: "Role", field: "role" }];

/** Role → tab visibility. super_admin is locked on every tab — a config slip must
 *  never be able to lock the last administrator out. */
const TAB_DEFAULTS = {
  super_admin: ALL_TABS,
  admin: ALL_TABS.filter((t) => t !== "ACCESS"),
  ops: ["PIPELINE","PENDING","READY","STMT","EXPOSURE","PAID","HOLD","LOGIC","PUSH","REVIEW","TICKETS","ADVANCES"],
  approver: ["ADVANCES"],
  auditor: ["PIPELINE","PENDING","READY","STMT","EXPOSURE","PAID","HOLD","DEALER","REP","LOGIC","TICKETS"],
  dealer: ["PIPELINE","STMT","ADVANCES"],
  rep: ["PIPELINE","STMT","ADVANCES"],
};
const ASSIGNABLE = ["admin", "ops", "approver", "auditor"];

export default function Access() {
  const { users, requests, dispatch, say, me } = useStore();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("ops");
  const [confirm, setConfirm] = useState(null);
  const [filter, setFilter] = useState({ role: [] });

  const pending = requests.filter((r) => r.status === "pending");
  const shownUsers = users.filter((u) => passesFilter(u, filter, FILTER_GROUPS));
  const filterGroupsWithOptions = FILTER_GROUPS.map((g) => ({ ...g, options: facet(users, g.field) }));
  const filterCount = activeCount(filter, FILTER_GROUPS);

  return (
    <>
      <PageHead title="Access">
        
      </PageHead>

      <div className="pagebody">
      <div className="sub">
        Who can get in, and what they can see. The app <b>default-denies</b> — an address
        that isn't listed here has no access at all.
      </div>

      {pending.length > 0 && (
        <div className="card">
          <div className="card-h"><h2>Access requests</h2></div>
          <div className="card-b">
          <div className="tblwrap">
            <table>
              <thead><tr><th>Email</th><th>Note</th><th>Asked</th><th /></tr></thead>
              <tbody>
                {pending.map((r) => (
                  <tr key={r.id}>
                    <td>{r.email}</td>
                    <td style={{ color: "var(--ink-3)" }}>{r.note}</td>
                    <td>{r.requested_at}</td>
                    <td className="r">
                      <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                        <select defaultValue="ops" style={{ width: 120 }} id={`role-${r.id}`}>
                          {ASSIGNABLE.map((x) => <option key={x}>{x}</option>)}
                        </select>
                        <button className="btn sm pri" onClick={() => {
                          const sel = document.getElementById(`role-${r.id}`).value;
                          dispatch({ type: "request-decide", id: r.id, approve: true, email: r.email, role: sel });
                          say(`${r.email} approved as ${sel}`);
                        }}>Approve</button>
                        <button className="btn sm danger" onClick={() => { dispatch({ type: "request-decide", id: r.id, approve: false }); say("Denied"); }}>Deny</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        </div>
      )}

      <div className="card">
          <div className="card-h">
            <h2>People</h2>
            <div className="sp" />
            <FilterPanel groups={filterGroupsWithOptions} value={filter} onApply={setFilter} count={filterCount} />
          </div>
          <div className="card-b">
        <div className="row" style={{ marginBottom: 12 }}>
          <input style={{ maxWidth: 280 }} placeholder="name@ourworldenergy.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <select style={{ width: 140 }} value={role} onChange={(e) => setRole(e.target.value)}>
            {ASSIGNABLE.map((r) => <option key={r}>{r}</option>)}
          </select>
          <button className="btn pri" disabled={!email.includes("@")}
            onClick={() => { dispatch({ type: "user-role", email: email.toLowerCase(), role }); setEmail(""); say("Role assigned"); }}>
            Add / update
          </button>
        </div>
        {shownUsers.length === 0 ? <Empty /> : (
          <div className="tblwrap">
            <table>
              <thead><tr><th>Email</th><th>Role</th><th /></tr></thead>
              <tbody>
                {shownUsers.map((u) => (
                  <tr key={u.email}>
                    <td>{u.email}{u.email === me && <> <Badge kind="blue">you</Badge></>}</td>
                    <td><Badge kind={u.role === "super_admin" ? "ok" : "mut"}>{u.role}</Badge></td>
                    <td className="r">
                      {u.role !== "super_admin" && (
                        <button className="btn sm danger" onClick={() => setConfirm({
                          title: "Remove this person?",
                          body: <>Remove <b>{u.email}</b>? They lose access immediately.</>,
                          confirmLabel: "Remove", danger: true,
                          onYes: () => { dispatch({ type: "user-remove", email: u.email }); setConfirm(null); say("Removed"); },
                        })}>remove</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </div>

      <div className="card">
          <div className="card-h"><h2>Tab visibility by role</h2></div>
          <div className="card-b">
        <div className="sub" style={{ margin: "0 0 10px" }}>
          Defaults per role. Super admin always sees every tab — that is deliberate, so a
          configuration slip cannot lock out the last administrator.
        </div>
        <div className="tblwrap">
          <table>
            <thead>
              <tr><th>Tab</th>{ROLES.map((r) => <th key={r} style={{ textAlign: "center" }}>{r}</th>)}</tr>
            </thead>
            <tbody>
              {ALL_TABS.map((t) => (
                <tr key={t}>
                  <td><b>{t}</b></td>
                  {ROLES.map((r) => (
                    <td key={r} style={{ textAlign: "center" }}>
                      {r === "super_admin"
                        ? <span title="lockout-proof">✓ 🔒</span>
                        : (TAB_DEFAULTS[r] || []).includes(t) ? "✓" : <span style={{ color: "var(--line)" }}>—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      </div>

      {confirm && <Confirm {...confirm} onNo={() => setConfirm(null)} />}
      </div>
    </>
  );
}
