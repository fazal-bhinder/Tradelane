import { BadgeCheck, Bot, CircleDashed, Pencil } from "lucide-react";
import { motion, type HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";
import type { Kind, Source, Verdict } from "../api";

type ButtonKind = "primary" | "secondary" | "ghost" | "danger";

const BUTTON: Record<ButtonKind, string> = {
  primary: "bg-indigo text-on-accent hover:bg-indigo-deep active:bg-indigo-press disabled:bg-control",
  secondary: "bg-surface text-ink border border-control hover:bg-raised active:bg-active disabled:text-muted",
  ghost: "text-ink-2 hover:bg-raised active:bg-active disabled:text-muted",
  danger: "bg-surface text-negative-ink border border-control hover:bg-negative-pale disabled:text-muted",
};

export function Button({ kind = "secondary", className = "", children, disabled, ...rest }: HTMLMotionProps<"button"> & { kind?: ButtonKind }) {
  return (
    <motion.button
      {...rest}
      disabled={disabled}
      whileHover={disabled ? undefined : { y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-4 text-[14px] font-medium whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed ${BUTTON[kind]} ${className}`}
    >
      {children}
    </motion.button>
  );
}

export function Card({ title, aside, children, className = "", pad = true }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`rounded-card border border-border bg-surface shadow-[0_1px_2px_rgb(0_55_112/0.04)] ${className}`}>
      {(title || aside) && (
        <header className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 pt-4">
          {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
          {aside && <div className="text-[13px] text-muted">{aside}</div>}
        </header>
      )}
      <div className={pad ? "p-5 pt-3" : ""}>{children}</div>
    </section>
  );
}

const VERDICT: Record<Verdict, { label: string; cls: string }> = {
  list: { label: "List", cls: "bg-positive-pale text-positive-ink" },
  check: { label: "Check", cls: "bg-notice-pale text-notice-ink ring-1 ring-inset ring-notice-line" },
  skip: { label: "Skip", cls: "bg-negative-pale text-negative-ink" },
  "needs-data": { label: "Needs data", cls: "bg-raised text-ink-2" },
};

export function VerdictPill({ verdict, className = "" }: { verdict: Verdict; className?: string }) {
  const v = VERDICT[verdict];
  return <span className={`inline-flex h-5 flex-none items-center rounded-full px-2 text-[12px] font-medium whitespace-nowrap ${v.cls} ${className}`}>{v.label}</span>;
}

export function DecisionPill({ decision }: { decision: "approved" | "rejected" }) {
  return decision === "approved" ? (
    <span className="inline-flex h-5 flex-none items-center gap-1 rounded-full bg-indigo-pale px-2 text-[12px] font-medium text-indigo-press">Approved</span>
  ) : (
    <span className="inline-flex h-5 flex-none items-center rounded-full bg-raised px-2 text-[12px] font-medium text-ink-2">Rejected</span>
  );
}

const KIND: Record<Kind, { label: string; Icon: typeof BadgeCheck }> = {
  fact: { label: "Fact", Icon: BadgeCheck },
  assumption: { label: "Assumption", Icon: Pencil },
  ai: { label: "AI", Icon: Bot },
  unknown: { label: "Missing", Icon: CircleDashed },
};

/** Where a number came from. The tooltip carries the source and the date it was checked. */
export function SourceTag({ source, compact = false }: { source: Source; compact?: boolean }) {
  const { label, Icon } = KIND[source.kind];
  const title = [source.label, source.checked && `Checked ${source.checked}`].filter(Boolean).join(" · ");
  const body = (
    <>
      <Icon size={13} strokeWidth={1.75} aria-hidden />
      {!compact && <span>{label}</span>}
    </>
  );
  const cls = `inline-flex h-5 flex-none items-center gap-1 rounded-md px-1.5 text-[12px] whitespace-nowrap ${
    source.kind === "unknown" ? "text-negative-ink bg-negative-pale" : source.kind === "ai" ? "text-indigo-press bg-indigo-pale" : "text-ink-2 bg-raised"
  }`;
  return source.url ? (
    <a href={source.url} target="_blank" rel="noreferrer" title={title} aria-label={`${label}: ${title}`} className={`${cls} hover:underline`}>
      {body}
    </a>
  ) : (
    <span title={title} aria-label={`${label}: ${title}`} className={cls}>
      {body}
    </span>
  );
}

export function Notice({ children, tone = "notice" }: { children: ReactNode; tone?: "notice" | "error" }) {
  const cls = tone === "error" ? "bg-negative-pale text-negative-ink" : "bg-notice-pale text-notice-ink ring-1 ring-inset ring-notice-line";
  return <div className={`rounded-control px-3 py-2 text-[13px] ${cls}`}>{children}</div>;
}

export function Bar({ className = "" }: { className?: string }) {
  return <span className={`inline-block rounded-md bg-active align-middle ${className}`} aria-hidden />;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-muted">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "h-9 rounded-control border border-control bg-surface px-3 text-[14px] text-ink num placeholder:text-muted focus:border-indigo focus:outline-none focus:ring-2 focus:ring-indigo/20";
