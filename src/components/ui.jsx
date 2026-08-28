import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "../lib/store.jsx";

export function Card({ title, children, right }) {
  return (
    <div className="card">
      {(title || right) && (
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          {title && <h2 style={{ margin: 0 }}>{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

/** `title` is forwarded — truncated badge text needs a tooltip to stay readable. */
export function Badge({ kind = "mut", title, children }) {
  return <span className={`b ${kind}`} title={title}>{children}</span>;
}

/**
 * A sortable column header. Pairs with useSortState/sortRows in lib/sort.js.
 *
 * `pageOnly` marks tables whose API cannot sort, so clicking reorders only the
 * loaded page — the tooltip says so rather than letting a page-sort pass for a
 * dataset-sort.
 */
export function SortTh({ k, sort, onSort, children, className = "", pageOnly, style }) {
  const on = sort?.k === k;
  return (
    <th className={("sortth " + className).trim()} style={style}
      aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      title={pageOnly ? "Sorts the rows on this page" : `Sort by this column`}
      onClick={() => onSort(k)}>
      <span className="sortth-i">
        {children}
        <span className={"sortth-a" + (on ? " on" : "")}>
          {on ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </span>
    </th>
  );
}

/**
 * Hover tooltip that appears instantly and wraps, unlike the browser's `title`
 * (which waits about a second and renders one unbroken line). Used wherever
 * text is truncated, so the full value is always one hover away.
 *
 * The bubble is rendered in a portal as position:fixed rather than absolutely
 * inside the cell. Tables live in `.tblwrap`, a horizontal scroll container,
 * and a scroll container clips on BOTH axes — an in-flow bubble would be cut
 * off on the first and last rows. A portal escapes that entirely.
 *
 * `title` stays on the element too: it is the path for touch long-press, where
 * :hover never fires.
 */
/**
 * Whether this device has real hover. On a mouse the styled bubble is the
 * tooltip and a native `title` would render a SECOND one beside it; on touch
 * there is no hover at all, so `title` (long-press) is the only path. Checked
 * once at module load rather than per render.
 */
const CAN_HOVER = typeof window !== "undefined" && typeof window.matchMedia === "function"
  ? window.matchMedia("(hover: hover)").matches
  : true;

export function Tip({ text, children, className = "", as: Tag = "span" }) {
  const [box, setBox] = useState(null);
  const ref = useRef(null);

  if (!text) return <Tag className={className}>{children}</Tag>;

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    // Flip above when there is no room below, and clamp horizontally so the
    // bubble never runs off either edge.
    const below = window.innerHeight - r.bottom > 120;
    setBox({
      left: Math.min(Math.max(8, r.left), window.innerWidth - 296),
      top: below ? r.bottom + 7 : undefined,
      bottom: below ? undefined : window.innerHeight - r.top + 7,
    });
  };
  const hide = () => setBox(null);

  return (
    <>
      {/* No `title` where hover works — it would draw a second, unstyled
          tooltip next to this one. aria-label keeps the full text available to
          screen readers either way. */}
      <Tag ref={ref} className={`tip ${className}`.trim()} tabIndex={0}
        title={CAN_HOVER ? undefined : text} aria-label={text}
        onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
        {children}
      </Tag>
      {box && createPortal(
        <span className="tip-b" role="tooltip" style={box}>{text}</span>,
        document.body
      )}
    </>
  );
}

/** An outage must never render as an all-clear — an empty list that means
 *  "nothing to do" says so explicitly rather than just being blank. */
export function Empty({ children = "Nothing here." }) {
  return <div className="stub">{children}</div>;
}

/** Loading placeholder shaped like the table it replaces, so the page does not
 *  jump when rows land. */
export function TableSkeleton({ rows = 6, cols = 6 }) {
  return (
    <div className="tblwrap" aria-busy="true" aria-label="Loading">
      <table>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }, (_, c) => (
                <td key={c}><span className="sk" style={{ width: c === 0 ? 78 : c === cols - 1 ? 54 : 100 - (c % 3) * 18 }} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A failed read, stated as a failure. Never collapse this into Empty: "we could
 * not load your pending approvals" and "you have no pending approvals" are
 * opposite facts, and on this app the second one wrongly reads as all-clear.
 */
export function ErrorState({ error, onRetry, what = "this" }) {
  const status = error?.status;
  return (
    <div className="errstate" role="alert">
      <div className="errstate-h">Could not load {what}.</div>
      <div className="errstate-m">{error?.message || "Something went wrong."}</div>
      {status === 0 && (
        <div className="errstate-hint">
          The API could not be reached. Check <code>VITE_API_BASE_URL</code> in <code>.env</code>,
          and that the server is up.
        </div>
      )}
      {onRetry && <button className="btn sm pri" onClick={onRetry} style={{ marginTop: 12 }}>Try again</button>}
    </div>
  );
}

/**
 * Renders the four states of one request in the right order. `empty` only wins
 * once we know the request actually succeeded.
 */
export function Async({ q, what, skeleton, isEmpty, empty, children }) {
  if (q.loading) return skeleton || <TableSkeleton />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} what={what} />;
  if (isEmpty) return <Empty>{empty}</Empty>;
  return children;
}

/** Offset pagination. Hidden entirely when everything fits on one page. */
export function Pager({ total, limit, offset, onOffset, busy }) {
  const pages = Math.max(1, Math.ceil((total || 0) / limit));
  const page = Math.floor(offset / limit) + 1;
  if (!total || pages <= 1) return null;
  const go = (p) => onOffset((Math.min(Math.max(1, p), pages) - 1) * limit);
  return (
    <div className="pager">
      <span className="pager-n">
        {offset + 1}–{Math.min(offset + limit, total)} of {total.toLocaleString()}
      </span>
      <div className="sp" />
      <button className="btn sm" disabled={page <= 1 || busy} onClick={() => go(page - 1)}>Previous</button>
      <span className="pager-p">Page {page} of {pages.toLocaleString()}</span>
      <button className="btn sm" disabled={page >= pages || busy} onClick={() => go(page + 1)}>Next</button>
    </div>
  );
}

/**
 * A dialog. Pass `footer` (the action buttons) and the title and buttons stay
 * pinned while only the fields scroll — on a long form the Save button would
 * otherwise sit below the fold, which is where people lose it.
 *
 * Without `footer` the whole body scrolls as one block, so callers that put
 * their buttons inside `children` keep working unchanged.
 */
export function Modal({ title, why, onClose, children, footer, wide }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="scrim" onClick={onClose}>
      <div className={"modal" + (footer ? " modal-split" : "")}
        style={wide ? { maxWidth: 860 } : undefined} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3>{title}</h3>
          {why && <div className="why">{why}</div>}
        </div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}

export function Toast() {
  const { toast } = useStore();
  if (!toast) return null;
  return <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.msg}</div>;
}

/** Confirmation dialog. The real app is missing one on "Approve all shown" —
 *  one mis-click can approve six figures — so every batch action here has one. */
export function Confirm({ title, body, confirmLabel = "Confirm", danger, onYes, onNo }) {
  return (
    <Modal title={title} onClose={onNo}>
      <div style={{ fontSize: 13.5, marginBottom: 16 }}>{body}</div>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={onNo}>Cancel</button>
        <button className={"btn " + (danger ? "danger" : "pri")} onClick={onYes}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}

/** Prompt for a single value — used for hold reasons, settlement amounts, etc. */
export function Ask({ title, why, label, initial = "", type = "text", onOk, onCancel, okLabel = "Save" }) {
  const [v, setV] = useState(initial);
  return (
    <Modal title={title} why={why} onClose={onCancel}>
      <label className="f">{label}</label>
      <input autoFocus type={type} value={v} onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && v !== "" && onOk(v)} />
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn pri" disabled={v === ""} onClick={() => onOk(v)}>{okLabel}</button>
      </div>
    </Modal>
  );
}
