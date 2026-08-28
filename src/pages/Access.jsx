import { useState } from "react";
import { RotateCcw, ShieldCheck } from "lucide-react";
import { useStore } from "../lib/store.jsx";
import { csvDownload } from "../lib/fmt.js";
import { useApi } from "../lib/useApi.js";
import * as api from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { Badge, Async, TableSkeleton, Confirm, Tip } from "../components/ui.jsx";
import { PageHead } from "../App.jsx";

/**
 * Access Control — which role reaches which page.
 *
 * Permission is granted per ROLE, never per person: two people doing the same
 * job should not drift apart, and "who can approve advances?" should have one
 * answer rather than one per user. Every change applies to live sessions
 * immediately, because the server reads permissions on each request.
 */
export default function Access() {
  const { say } = useStore();
  const { canWrite, refresh } = useAuth();
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const mayWrite = canWrite("access");
  const q = useApi((signal) => api.accessMatrix({ signal }), []);

  const roles = q.data?.roles || [];
  const pages = q.data?.pages || [];
  const grants = q.data?.grants || {};
  const groups = [...new Set(pages.map((p) => p.group))];

  /** A system role (super admin) is locked open and never appears in grants. */
  const has = (role, page) => role.is_system || (grants[role.key] || []).includes(page);

  async function act(fn, okMsg) {
    setBusy(true);
    try {
      await fn();
      say(okMsg);
      q.reload();
      // The change may have altered the signed-in user's own access.
      refresh();
    } catch (e) {
      say(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  const toggle = (role, page, on) =>
    act(() => api.accessGrant(role.key, page, on),
      `${role.name} ${on ? "granted" : "no longer has"} ${pages.find((p) => p.key === page)?.name || page}`);

  const setRow = (role, on) =>
    act(() => api.accessRolePages(role.key, on ? pages.map((p) => p.key) : []),
      on ? `${role.name} granted every page` : `${role.name} cleared`);

  function exportCsv() {
    const header = ["Group", "Page", ...roles.map((r) => r.name)];
    const body = pages.map((p) => [p.group, p.name, ...roles.map((r) => has(r, p.key) ? "yes" : "no")]);
    csvDownload("access matrix", header, body) ? say("Exported") : say("Nothing to export", true);
  }

  return (
    <>
      <PageHead eyebrow="Admin" title="Access Control"
        count={q.loading ? "loading…" : q.error ? "—" : `${roles.length} roles · ${pages.length} pages`}>
        <button className="btn" onClick={exportCsv} disabled={!pages.length}>Export CSV</button>
        {mayWrite && (
          <button className="btn" disabled={busy} onClick={() => setConfirm({
            title: "Restore the default grants?",
            body: <>Every role goes back to its shipped set of pages. <b>Every customisation here is
              discarded</b>, and it applies to everyone's current session immediately.</>,
            confirmLabel: "Restore defaults", danger: true,
            onYes: () => { setConfirm(null); act(() => api.accessRestoreDefaults(), "Defaults restored"); },
          })}>
            <RotateCcw size={14} strokeWidth={2} />Restore defaults
          </button>
        )}
      </PageHead>

      <div className="pagebody">
        <div className="sub">
          Which role reaches which page. Permission is granted per <b>role</b>, not per person, so
          two people with the same job cannot drift apart. A change applies to anyone signed in on
          that role <b>immediately</b> — they do not need to sign out.
          {!mayWrite && <> You have view-only access here.</>}
        </div>

        <Async q={q} what="the access matrix" isEmpty={!pages.length}
          skeleton={<div className="card"><TableSkeleton cols={6} /></div>}
          empty="No roles or pages configured.">
          <div className="card">
            <div className="card-h">
              <h2>Role &times; page</h2>
              <div className="sp" />
              <Badge kind="ok"><ShieldCheck size={11} strokeWidth={2.2} />Super admin is locked open</Badge>
            </div>
            <div className="card-b flush">
              <div className={"tblwrap" + (busy ? " refreshing" : "")}>
                <table className="stickycols">
                  <thead>
                    <tr>
                      <th className="sticky1" style={{ minWidth: 190 }}>Page</th>
                      {roles.map((r) => (
                        <th key={r.key} style={{ textAlign: "center", minWidth: 112 }}>
                          <Tip text={r.description}>{r.name}</Tip>
                          <div className="submeta" style={{ fontWeight: 500 }}>
                            {r.people} {r.people === 1 ? "person" : "people"}
                            {r.read_only && " · view only"}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((grp) => (
                      <>
                        <tr key={grp} className="matrix-grp">
                          <td className="sticky1">{grp.replace(/_/g, " ")}</td>
                          <td colSpan={roles.length} />
                        </tr>
                        {pages.filter((p) => p.group === grp).map((p) => (
                          <tr key={p.key}>
                            <td className="sticky1"><b>{p.name}</b></td>
                            {roles.map((r) => (
                              <td key={r.key} style={{ textAlign: "center" }}>
                                {r.is_system ? (
                                  <Tip text="Super admin always holds every permission — a configuration slip must never lock out the last administrator.">
                                    <span style={{ color: "var(--due)" }}>✓&#xfe0e;</span>
                                  </Tip>
                                ) : (
                                  <input type="checkbox" style={{ width: "auto", margin: 0, cursor: mayWrite ? "pointer" : "not-allowed" }}
                                    checked={has(r, p.key)} disabled={!mayWrite || busy}
                                    onChange={(e) => toggle(r, p.key, e.target.checked)}
                                    aria-label={`${r.name} can see ${p.name}`} />
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </>
                    ))}
                    {mayWrite && (
                      <tr className="matrix-grp">
                        <td className="sticky1">Whole row</td>
                        {roles.map((r) => (
                          <td key={r.key} style={{ textAlign: "center" }}>
                            {r.is_system ? <span className="submeta">locked</span> : (
                              <div className="row" style={{ justifyContent: "center", gap: 4, flexWrap: "nowrap" }}>
                                <button className="btn sm" disabled={busy} onClick={() => setRow(r, true)}>All</button>
                                <button className="btn sm" disabled={busy} onClick={() => setRow(r, false)}>None</button>
                              </div>
                            )}
                          </td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-h"><h2>What each role is for</h2></div>
            <div className="card-b">
              <div className="rolepick" style={{ marginBottom: 0 }}>
                {roles.map((r) => (
                  <div key={r.key} className="rolecard" style={{ cursor: "default" }}>
                    <div className="t">
                      {r.name}
                      <span className="submeta" style={{ fontWeight: 500 }}>
                        {" · "}{r.is_system ? "all pages" : `${r.page_count} pages`}
                        {" · "}{r.people} {r.people === 1 ? "person" : "people"}
                      </span>
                    </div>
                    <div className="c">
                      {r.description}
                      {r.read_only && <> <b>Read-only</b> — can open its pages but not change anything.</>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Async>
      </div>

      {confirm && <Confirm {...confirm} onNo={() => setConfirm(null)} />}
    </>
  );
}
