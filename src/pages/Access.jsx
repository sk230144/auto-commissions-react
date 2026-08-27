import { useState } from "react";
import { RotateCcw, ShieldCheck } from "lucide-react";
import { useStore } from "../lib/store.jsx";
import { csvDownload } from "../lib/fmt.js";
import { useAuth, PAGES, PAGE_KEYS, ROLES, ROLE_LABEL, ROLE_BLURB, ROLE_PAGES } from "../lib/auth.jsx";
import { Badge, Confirm, Tip } from "../components/ui.jsx";
import { PageHead } from "../App.jsx";

/** super_admin is granted everything in code, so it is shown as locked rather
 *  than editable — the matrix must never be able to lock out the last admin. */
const EDITABLE = ROLES.filter((r) => r !== "super_admin");

/**
 * Access Control — which role reaches which page.
 *
 * Permission is granted per ROLE, never per person: two people doing the same
 * job should not be able to drift apart, and an audit question ("who can
 * approve advances?") should have one answer, not one per user.
 */
export default function Access() {
  const { say } = useStore();
  const { grants, setGrants, users } = useAuth();
  const [confirm, setConfirm] = useState(null);

  const groups = [...new Set(PAGES.map((p) => p.group))];
  const headcount = (role) => users.filter((u) => u.role === role).length;

  const has = (role, page) => role === "super_admin" || (grants[role] || []).includes(page);

  function toggle(role, page) {
    setGrants((g) => {
      const cur = g[role] || [];
      const next = cur.includes(page) ? cur.filter((p) => p !== page) : [...cur, page];
      return { ...g, [role]: next };
    });
  }

  function setRow(role, on) {
    setGrants((g) => ({ ...g, [role]: on ? [...PAGE_KEYS] : [] }));
    say(on ? `${ROLE_LABEL[role]} granted every page` : `${ROLE_LABEL[role]} cleared`);
  }

  function reset() {
    setGrants(ROLE_PAGES);
    setConfirm(null);
    say("Restored the default grants");
  }

  function exportCsv() {
    const header = ["Page", ...ROLES.map((r) => ROLE_LABEL[r])];
    const body = PAGES.map((p) => [p.label, ...ROLES.map((r) => has(r, p.key) ? "yes" : "no")]);
    csvDownload("access matrix", header, body) ? say("Exported") : say("Nothing to export", true);
  }

  return (
    <>
      <PageHead eyebrow="Admin" title="Access Control"
        count={`${ROLES.length} roles · ${PAGES.length} pages`}>
        <button className="btn" onClick={exportCsv}>Export CSV</button>
        <button className="btn" onClick={() => setConfirm({
          title: "Restore the default grants?",
          body: <>Every role goes back to its shipped set of pages. Any customisation here is lost.</>,
          confirmLabel: "Restore defaults", danger: true, onYes: reset,
        })}>
          <RotateCcw size={14} strokeWidth={2} />Restore defaults
        </button>
      </PageHead>

      <div className="pagebody">
        <div className="sub">
          Which role reaches which page. Permission is granted per <b>role</b>, not per person, so
          two people with the same job cannot drift apart and every change applies everywhere at
          once. Removing a page hides it from the sidebar and blocks the route.
        </div>

        <div className="card">
          <div className="card-h">
            <h2>Role &times; page</h2>
            <div className="sp" />
            <Badge kind="ok"><ShieldCheck size={11} strokeWidth={2.2} />Super admin is locked open</Badge>
          </div>
          <div className="card-b flush">
            <div className="tblwrap">
              <table className="stickycols">
                <thead>
                  <tr>
                    <th className="sticky1" style={{ minWidth: 190 }}>Page</th>
                    {ROLES.map((r) => (
                      <th key={r} style={{ textAlign: "center", minWidth: 104 }}>
                        <Tip text={ROLE_BLURB[r]}>{ROLE_LABEL[r]}</Tip>
                        <div className="submeta" style={{ fontWeight: 500 }}>
                          {headcount(r)} {headcount(r) === 1 ? "person" : "people"}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((grp) => (
                    <>
                      <tr key={grp} className="matrix-grp">
                        <td className="sticky1" colSpan={1}>{grp}</td>
                        <td colSpan={ROLES.length} />
                      </tr>
                      {PAGES.filter((p) => p.group === grp).map((p) => (
                        <tr key={p.key}>
                          <td className="sticky1"><b>{p.label}</b></td>
                          {ROLES.map((r) => {
                            const locked = r === "super_admin";
                            return (
                              <td key={r} style={{ textAlign: "center" }}>
                                {locked ? (
                                  <Tip text="A super admin always sees every page — a configuration slip must never lock out the last administrator.">
                                    <span style={{ color: "var(--due)" }}>✓&#xfe0e;</span>
                                  </Tip>
                                ) : (
                                  <input type="checkbox" style={{ width: "auto", margin: 0, cursor: "pointer" }}
                                    checked={has(r, p.key)} onChange={() => toggle(r, p.key)}
                                    aria-label={`${ROLE_LABEL[r]} can see ${p.label}`} />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </>
                  ))}
                  <tr className="matrix-grp">
                    <td className="sticky1">Whole row</td>
                    {ROLES.map((r) => (
                      <td key={r} style={{ textAlign: "center" }}>
                        {r === "super_admin" ? <span className="submeta">locked</span> : (
                          <div className="row" style={{ justifyContent: "center", gap: 4, flexWrap: "nowrap" }}>
                            <button className="btn sm" onClick={() => setRow(r, true)}>All</button>
                            <button className="btn sm" onClick={() => setRow(r, false)}>None</button>
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h"><h2>What each role is for</h2></div>
          <div className="card-b">
            <div className="rolepick" style={{ marginBottom: 0 }}>
              {ROLES.map((r) => (
                <div key={r} className="rolecard" style={{ cursor: "default" }}>
                  <div className="t">
                    {ROLE_LABEL[r]}
                    <span className="submeta" style={{ fontWeight: 500 }}>
                      {" · "}{r === "super_admin" ? PAGE_KEYS.length : (grants[r] || []).length} pages
                      {" · "}{headcount(r)} {headcount(r) === 1 ? "person" : "people"}
                    </span>
                  </div>
                  <div className="c">{ROLE_BLURB[r]}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {confirm && <Confirm {...confirm} onNo={() => setConfirm(null)} />}
    </>
  );
}
