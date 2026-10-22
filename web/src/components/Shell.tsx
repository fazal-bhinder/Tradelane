import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Activity, Inbox, LayoutGrid, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Scale, Sparkles, Upload, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { api, type User } from "../api";
import { useAnalyst } from "./Analyst";
import { Avatar } from "./Avatar";
import { Mesh } from "./Mesh";
import { ThemeSwitch } from "./Theme";
import { useToast } from "./Toast";

export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <rect width="24" height="24" rx="7" className="fill-[#533afd] dark:fill-white" />
      <path d="M5 9.5h9.5M9.5 14.5H19" className="stroke-white dark:stroke-black" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

const fade = { initial: { opacity: 0, x: -6 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -6 }, transition: { duration: 0.18 } };

function useWaiting() {
  const { data } = useQuery({ queryKey: ["catalogue"], queryFn: api.catalogue });
  if (!data) return null;
  return data.products.flatMap((p) => p.lanes).filter((l) => !l.review && l.verdict !== "needs-data").length;
}

function Nav({ onPick, collapsed }: { onPick?: () => void; collapsed?: boolean }) {
  const waiting = useWaiting();
  const items: { to: string; label: string; Icon: typeof Inbox; count?: number | null }[] = [
    { to: "/", label: "Catalogue", Icon: LayoutGrid },
    { to: "/review", label: "Review", Icon: Inbox, count: waiting },
    { to: "/import", label: "Import", Icon: Upload },
    { to: "/activity", label: "Activity", Icon: Activity },
    { to: "/rules", label: "Rules and sources", Icon: Scale },
  ];
  return (
    <nav aria-label="Main" className="space-y-1">
      {items.map(({ to, label, Icon, count }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          onClick={onPick}
          title={collapsed ? label : undefined}
          aria-label={collapsed ? label : undefined}
          className={({ isActive }) => `relative flex h-10 items-center gap-3 rounded-control px-3 text-[14px] transition-colors ${isActive ? "font-medium text-indigo-press" : "text-ink-2 hover:bg-raised"}`}
        >
          {({ isActive }) => (
            <>
              {isActive && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-control bg-indigo-pale" transition={{ type: "spring", stiffness: 450, damping: 36 }} />}
              <span className="relative">
                <Icon size={17} strokeWidth={1.7} className={isActive ? "text-indigo" : "text-muted"} aria-hidden />
                {collapsed && !!count && <span className="absolute -top-1 -right-1.5 size-2 rounded-full bg-indigo ring-2 ring-surface" />}
              </span>
              <AnimatePresence initial={false}>
                {!collapsed && (
                  <motion.span {...fade} className="relative flex flex-1 items-center justify-between gap-2 whitespace-nowrap">
                    {label}
                    {!!count && (
                      <span className={`num rounded-full px-1.5 text-[12px] ${isActive ? "bg-indigo text-on-accent" : "bg-raised text-ink-2"}`} aria-label={`${count} lanes waiting`}>{count}</span>
                    )}
                  </motion.span>
                )}
              </AnimatePresence>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function Me({ me, collapsed }: { me: User; collapsed?: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: api.users });
  const other = users?.find((u) => u.id !== me.id);
  const swap = useMutation({
    mutationFn: (id: string) => api.login(id),
    onSuccess: (u) => { qc.invalidateQueries(); toast(`Signed in as ${u.name.split(" ")[0]}, ${u.role}`); },
  });
  const out = useMutation({ mutationFn: api.logout, onSuccess: () => qc.setQueryData(["me"], null) });

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-3">
        <ThemeSwitch compact />
        {other && (
          <motion.button whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }} onClick={() => swap.mutate(other.id)}
            title={`Switch to ${other.name.split(" ")[0]} (${other.role})`} aria-label={`Switch to ${other.name}`} className="rounded-full opacity-60 hover:opacity-100">
            <Avatar user={other} size={24} />
          </motion.button>
        )}
        <Avatar user={me} size={34} />
      </div>
    );
  }
  return (
    <div className="rounded-card border border-border bg-surface p-3 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
      <div className="flex items-center gap-3">
        <Avatar user={me} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium leading-5">{me.name}</p>
          <p className="truncate text-[12px] capitalize text-muted">{me.role}</p>
        </div>
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => out.mutate()} className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-raised hover:text-ink" aria-label="Sign out" title="Sign out">
          <LogOut size={15} />
        </motion.button>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-rule pt-3">
        <ThemeSwitch icons />
        {other && (
          <motion.button whileHover={{ x: 2 }} whileTap={{ scale: 0.96 }} onClick={() => swap.mutate(other.id)} disabled={swap.isPending}
            className="flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 text-[12px] text-ink-2 transition-colors hover:bg-raised hover:text-ink"
            title={`Switch to ${other.name} (${other.role})`}>
            <Avatar user={other} size={20} />
            Be {other.name.split(" ")[0]}
          </motion.button>
        )}
      </div>
    </div>
  );
}

function Sidebar({ me, onPick, collapsed = false, onToggle }: { me: User; onPick?: () => void; collapsed?: boolean; onToggle?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-6">
      <div className={`flex items-center gap-2.5 ${collapsed ? "flex-col" : "px-1.5"}`}>
        <Mark size={26} />
        <AnimatePresence initial={false}>
          {!collapsed && <motion.span {...fade} className="text-[16px] font-semibold tracking-tight whitespace-nowrap">Tradelane</motion.span>}
        </AnimatePresence>
        {onToggle && (
          <motion.button whileTap={{ scale: 0.9 }} onClick={onToggle} className={`grid size-9 place-items-center rounded-control text-muted hover:bg-raised hover:text-ink ${collapsed ? "" : "ml-auto"}`}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={`${collapsed ? "Expand" : "Collapse"} sidebar  [`}>
            {collapsed ? <PanelLeftOpen size={17} strokeWidth={1.7} /> : <PanelLeftClose size={17} strokeWidth={1.7} />}
          </motion.button>
        )}
      </div>
      <Nav onPick={onPick} collapsed={collapsed} />
      <div className="mt-auto">
        <Me me={me} collapsed={collapsed} />
      </div>
    </div>
  );
}

function useCollapsed() {
  const [collapsed, set] = useState(() => {
    try { return localStorage.getItem("tl-sidebar") === "collapsed"; } catch { return false; }
  });
  const toggle = () => set((c) => {
    try { localStorage.setItem("tl-sidebar", c ? "open" : "collapsed"); } catch { /* not remembered */ }
    return !c;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "[" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return [collapsed, toggle] as const;
}

export function Shell({ me, children }: { me: User; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, toggle] = useCollapsed();
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="min-h-dvh" style={{ ["--sb" as string]: `${collapsed ? 76 : 256}px` }}>
      {/* fixed, not sticky: it never moves while the page scrolls or bounces */}
      <motion.aside
        animate={{ width: collapsed ? 76 : 256 }}
        transition={{ type: "spring", stiffness: 380, damping: 38 }}
        className="fixed inset-y-0 left-0 z-30 hidden overflow-hidden border-r border-border bg-surface px-3 py-4 lg:block"
      >
        <Sidebar me={me} collapsed={collapsed} onToggle={toggle} />
      </motion.aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface/85 px-4 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <Mark size={22} />
          <span className="text-[15px] font-semibold tracking-tight">Tradelane</span>
        </div>
        <button className="grid size-11 place-items-center rounded-control text-ink-2" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu size={20} strokeWidth={1.6} />
        </button>
      </header>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-surface p-4 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu"
          >
            <button className="absolute top-3 right-3 grid size-11 place-items-center rounded-control" onClick={() => setOpen(false)} aria-label="Close menu">
              <X size={20} strokeWidth={1.6} />
            </button>
            <Sidebar me={me} onPick={() => setOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <main className="relative min-w-0 overflow-x-clip transition-[margin] duration-300 ease-out lg:ml-[var(--sb)]">
        <Mesh />
        <div className="relative px-4 pt-6 pb-20 sm:px-6 lg:px-10 lg:pt-10">{children}</div>
      </main>
    </div>
  );
}

export function PageTitle({ title, sub, actions, eyebrow }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  const analyst = useAnalyst();
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4"
    >
      <div className="min-w-0 max-w-[760px]">
        {eyebrow}
        <h1 className="display text-[34px] text-ink sm:text-[44px]">{title}</h1>
        {sub && <div className="mt-3 text-[15px] leading-6 text-ink-2">{sub}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        <motion.button
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => analyst()}
          className="inline-flex h-9 items-center gap-2 rounded-full bg-navy pr-2 pl-3.5 text-[14px] font-medium text-white shadow-[0_8px_24px_rgb(28_30_84/0.28)] ring-1 ring-white/10"
        >
          <Sparkles size={15} className="text-[#b9b9f9] dark:text-white/80" />
          Ask Tradelane
          <kbd className="rounded-full bg-white/15 px-1.5 text-[11px] text-white/80">⌘K</kbd>
        </motion.button>
      </div>
    </motion.div>
  );
}
