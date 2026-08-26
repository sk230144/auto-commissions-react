import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Sparkles } from "lucide-react";
import { useStore } from "../lib/store.jsx";
import { money } from "../lib/fmt.js";

/**
 * Floating "Ask" assistant. There is no backend here — this is the standalone
 * dummy-data build — so it answers by reading the same in-memory store every
 * page reads, pattern-matching a handful of question shapes people actually
 * ask about commissions (what's pending, what's on hold, project lookups).
 * Anything it doesn't recognize gets an honest "I can't answer that yet"
 * rather than a fabricated number.
 */
export default function AskAI() {
  const { lines, review, advances, eco } = useStore();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [log, setLog] = useState([
    { from: "ai", text: "Ask me about pending lines, holds, a specific OUR#, or open review items. This runs entirely on the sample data loaded in this build." },
  ]);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [log, open]);

  function answer(text) {
    const s = text.toLowerCase().trim();
    const our = text.match(/our\d{5,}/i)?.[0]?.toUpperCase();

    if (our) {
      const hits = lines.filter((l) => l.our === our);
      if (hits.length === 0) return `No ledger lines found for ${our} in the loaded sample data.`;
      const total = hits.reduce((sum, l) => sum + l.balance, 0);
      return `${our} has ${hits.length} line${hits.length === 1 ? "" : "s"}: ` +
        hits.map((l) => `${l.party} (${l.kind}, ${money(l.balance)} ${l.cls})`).join("; ") +
        `. Balance remaining: ${money(total)}.`;
    }

    if (/pending/.test(s)) {
      const p = lines.filter((l) => l.cls === "pending" && !l.norate);
      const sum = p.reduce((a, l) => a + l.amount, 0);
      return `${p.length} ${eco} line${p.length === 1 ? "" : "s"} pending approval, totalling ${money(sum)}.`;
    }
    if (/ready/.test(s)) {
      const r = lines.filter((l) => l.cls === "ready");
      const sum = r.reduce((a, l) => a + l.readyBal, 0);
      return `${r.length} line${r.length === 1 ? "" : "s"} ready to pay, totalling ${money(sum)}.`;
    }
    if (/hold/.test(s)) {
      const h = lines.filter((l) => l.cls === "onhold");
      return h.length === 0 ? "Nothing is on hold right now."
        : `${h.length} line${h.length === 1 ? "" : "s"} on hold: ` + h.map((l) => `${l.our} (${l.party})`).join(", ") + ".";
    }
    if (/review|open item/.test(s)) {
      const o = review.filter((r) => r.status === "open");
      return o.length === 0 ? "No open review items."
        : `${o.length} open review item${o.length === 1 ? "" : "s"}: ` + o.map((r) => r.title).join("; ") + ".";
    }
    if (/advance/.test(s)) {
      const a = advances.filter((x) => x.status === "pending");
      return a.length === 0 ? "No advances awaiting approval."
        : `${a.length} advance${a.length === 1 ? "" : "s"} awaiting approval: ` + a.map((x) => `${x.code} (${x.party})`).join(", ") + ".";
    }
    if (/norate|no rate|needs rate/.test(s)) {
      const nr = lines.filter((l) => l.norate);
      return nr.length === 0 ? "Every line has a matching rate card row."
        : `${nr.length} line${nr.length === 1 ? "" : "s"} are missing a rate card and can't be priced: ` + nr.map((l) => l.our).join(", ") + ".";
    }
    return "I can only answer from the sample data loaded here — try asking about pending lines, ready to pay, holds, an OUR# project, advances, or open review items.";
  }

  function send() {
    const text = q.trim();
    if (!text) return;
    setLog((l) => [...l, { from: "user", text }, { from: "ai", text: answer(text) }]);
    setQ("");
  }

  return (
    <>
      <button className="askfab" onClick={() => setOpen((o) => !o)}>
        {open ? <X size={18} strokeWidth={2.2} /> : <MessageCircle size={18} strokeWidth={2.2} />}
        <span>Ask</span>
      </button>

      {open && (
        <div className="askpanel">
          <div className="askpanel-h">
            <Sparkles size={15} strokeWidth={2} />
            <span>Ask about this data</span>
            <button className="itool" onClick={() => setOpen(false)}><X size={15} strokeWidth={2} /></button>
          </div>
          <div className="askpanel-body">
            {log.map((m, i) => (
              <div key={i} className={"askmsg " + m.from}>{m.text}</div>
            ))}
            <div ref={endRef} />
          </div>
          <div className="askpanel-input">
            <input placeholder="e.g. what's pending, or OUR107401…" value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()} />
            <button className="itool pri" onClick={send} disabled={!q.trim()}><Send size={15} strokeWidth={2} /></button>
          </div>
        </div>
      )}
    </>
  );
}
