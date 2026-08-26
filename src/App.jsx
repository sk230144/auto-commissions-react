import { createContext, useContext, useEffect, useState } from "react";
import { Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import {
  LayoutGrid, Clock, CircleCheck, FileText, TrendingUp, Receipt, PauseCircle,
  ArrowLeftRight, SlidersHorizontal, Percent, FunctionSquare, Send, CircleAlert,
  MessageSquare, KeyRound, PanelLeftClose, PanelLeftOpen, Sun, Moon, Menu,
} from "lucide-react";
import { useStore } from "./lib/store.jsx";
import { useTheme } from "./lib/theme.js";
import { useApi } from "./lib/useApi.js";
import * as api from "./lib/api.js";
import { Toast } from "./components/ui.jsx";
import { Logo, LogoMark } from "./components/Logo.jsx";
import AskAI from "./components/AskAI.jsx";

import Pipeline from "./pages/Pipeline.jsx";
import Lines from "./pages/Lines.jsx";
import Statements from "./pages/Statements.jsx";
import Exposure from "./pages/Exposure.jsx";
import Advances from "./pages/Advances.jsx";
import Settings from "./pages/Settings.jsx";
import Logic from "./pages/Logic.jsx";
import Pushes from "./pages/Pushes.jsx";
import Review from "./pages/Review.jsx";
import Tickets from "./pages/Tickets.jsx";
import Access from "./pages/Access.jsx";

const ECO_LABEL = { dealer: "Dealer Pay", rep: "Sales Rep Pay" };
const ECO_SHORT = { dealer: "Dealer", rep: "Sales Reps" };
const I = { size: 16, strokeWidth: 1.9 };

/** Lets PageHead's hamburger open the off-canvas nav without prop threading. */
const NavCtx = createContext({ navOpen: false, setNavOpen: () => {} });

export default function App() {
  const { eco, setEco, lines, review, advances, me } = useStore();
  const { theme, cycle } = useTheme();
  const [mini, setMini] = useState(() => localStorage.getItem("ac.navMini") === "1");
  const [navOpen, setNavOpen] = useState(false);
  const loc = useLocation();

  useEffect(() => { localStorage.setItem("ac.navMini", mini ? "1" : "0"); }, [mini]);

  // The overlay never survives a navigation or an Escape.
  useEffect(() => { setNavOpen(false); }, [loc.pathname]);
  useEffect(() => {
    if (!navOpen) return;
    const k = (e) => e.key === "Escape" && setNavOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [navOpen]);

  // Badges show the UNFILTERED totals, so the rail keeps meaning whatever the
  // current page happens to be filtered to.
  const badgeQ = useApi(
    (signal) => api.paymentSummary({ party_type: eco, show_zeros: true, show_all_dates: true }, { signal }),
    [eco]
  );
  const tabs = badgeQ.data?.tabs;
  const badge = {
    pending: tabs?.pending_approval?.lines || 0,
    ready: tabs?.ready_to_pay?.lines || 0,
    review: review.filter((r) => r.status === "open").length,
    advances: advances.filter((a) => a.status === "pending").length,
  };

  // Icons are chosen for what the page is about, not for decoration.
  const nav = [
    { grp: "Payments", items: [
      { k: "pipeline", Ic: LayoutGrid,    label: "Pipeline Overview" },
      { k: "pending",  Ic: Clock,          label: "Pending Approval", n: badge.pending },
      { k: "ready",    Ic: CircleCheck,    label: "Ready to Pay",     n: badge.ready },
      { k: "stmt",     Ic: FileText,       label: "Pay Statements" },
      { k: "exposure", Ic: TrendingUp,     label: "Exposure" },
      { k: "paid",     Ic: Receipt,        label: "Payment Records" },
      { k: "hold",     Ic: PauseCircle,    label: "On Hold" },
      { k: "advances", Ic: ArrowLeftRight, label: "Advances", n: badge.advances },
    ]},
    { grp: "Rate cards", items: [
      { k: "dealer", Ic: SlidersHorizontal, label: "Dealer Rates" },
      { k: "rep",    Ic: Percent,           label: "Sales Rep Rates" },
      { k: "logic",  Ic: FunctionSquare,    label: "Payout Logic" },
    ]},
    { grp: "Operations", items: [
      { k: "push",    Ic: Send,          label: "Manual Payments" },
      { k: "review",  Ic: CircleAlert,   label: "Open Items", n: badge.review },
      { k: "tickets", Ic: MessageSquare, label: "Tickets" },
      { k: "access",  Ic: KeyRound,      label: "Access" },
    ]},
  ];

  // Opening a rate card forces the matching ecosystem, as the original does.
  useEffect(() => {
    if (loc.pathname === "/dealer" && eco !== "dealer") setEco("dealer");
    if (loc.pathname === "/rep" && eco !== "rep") setEco("rep");
  }, [loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const initials = me.split("@")[0].split(".").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  const ThemeIcon = theme === "dark" ? Moon : Sun;
  const themeTitle = `Theme: ${theme} — click to switch`;

  return (
    <NavCtx.Provider value={{ navOpen, setNavOpen }}>
    <div className={"app" + (mini ? " mini" : "") + (navOpen ? " navopen" : "")}>
      {/* Tapping outside the overlay nav closes it (mobile/tablet only). */}
      {navOpen && <div className="navscrim" onClick={() => setNavOpen(false)} />}
      <aside className="side">
        {/* The lockup, collapse toggle, and theme toggle share one row — the app
            name sits under it as a rule, so the product never competes with the
            brand for the same line. */}
        <div className="brandrow">
          <div className="brand">
            <div className="logo-full"><Logo height={25} /></div>
            <div className="logo-mark"><LogoMark size={30} /></div>
          </div>
          <div className="railtools">
            <button className="itool" onClick={() => setMini(!mini)} title={mini ? "Expand nav" : "Collapse nav"}>
              {mini ? <PanelLeftOpen {...I} /> : <PanelLeftClose {...I} />}
            </button>
            <button className="itool" onClick={cycle} title={themeTitle}>
              <ThemeIcon {...I} />
            </button>
          </div>
        </div>
        <div className="appname">Auto Commissions</div>

        <div className="eco">
          {["dealer", "rep"].map((e) => (
            <button key={e} className={eco === e ? "on" : ""} onClick={() => setEco(e)}>{ECO_SHORT[e]}</button>
          ))}
        </div>

        <div className="navscroll">
          {nav.map((sec) => (
            <div key={sec.grp}>
              <div className="grp-h">{sec.grp}</div>
              {sec.items.map(({ k, Ic, label, n: cnt }) => (
                <NavLink key={k} to={"/" + k} title={label}
                  className={({ isActive }) => "navitem" + (isActive ? " on" : "")}>
                  <span className="ic"><Ic {...I} /></span>
                  <span className="navlabel">{label}</span>
                  {cnt > 0 && <span className="cnt">{cnt}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </div>

        <div className="railfoot">
          <div className="avatar">{initials}</div>
          <div className="em">{me}</div>
        </div>
      </aside>

      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/pipeline" replace />} />
          <Route path="/pipeline" element={<Pipeline />} />
          {/* key={eco} remounts on the rail toggle so page/selection state cannot
              leak from a dealer view into a rep view. */}
          <Route path="/pending"  element={<Lines key={eco} tab="pending_approval" title="Pending Approval" eyebrow={ECO_LABEL[eco]} />} />
          <Route path="/ready"    element={<Lines key={eco} tab="ready_to_pay"     title="Ready to Pay"     eyebrow={ECO_LABEL[eco]} />} />
          <Route path="/paid"     element={<Lines key={eco} tab="payment_records"  title="Payment Records"  eyebrow={ECO_LABEL[eco]} />} />
          <Route path="/hold"     element={<Lines key={eco} tab="on_hold"          title="On Hold"          eyebrow={ECO_LABEL[eco]} />} />
          <Route path="/stmt"     element={<Statements />} />
          <Route path="/exposure" element={<Exposure />} />
          <Route path="/advances" element={<Advances />} />
          <Route path="/dealer"   element={<Settings group="DEALER" />} />
          <Route path="/rep"      element={<Settings group="REP" />} />
          <Route path="/logic"    element={<Logic />} />
          <Route path="/push"     element={<Pushes />} />
          <Route path="/review"   element={<Review />} />
          <Route path="/tickets"  element={<Tickets />} />
          <Route path="/access"   element={<Access />} />
        </Routes>
      </main>

      <Toast />
      <AskAI />
    </div>
    </NavCtx.Provider>
  );
}

/** Shared page header — every page gets the same identity block. */
export function PageHead({ eyebrow, title, count, children }) {
  const { eco, setEco } = useStore();
  const { setNavOpen } = useContext(NavCtx);
  return (
    <div className="pagehead">
      <div className="headrow">
        {/* Only exists below the tablet breakpoint, where the rail is off-canvas. */}
        <button className="burger" onClick={() => setNavOpen(true)} aria-label="Open navigation">
          <Menu size={19} strokeWidth={2} />
        </button>
        <div>
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h1>{title}</h1>
        </div>
        {count && <span className="count">{count}</span>}
        <div className="sp" />
        {/* Hidden on desktop (the rail carries the toggle there); appears when
            the rail collapses to icons and the toggle would otherwise be lost. */}
        <div className="eco eco-inline">
          {["dealer", "rep"].map((e) => (
            <button key={e} className={eco === e ? "on" : ""} onClick={() => setEco(e)}>{ECO_SHORT[e]}</button>
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}
