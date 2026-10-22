import { motion } from "motion/react";
import type { Line, Swing } from "../api";
import { money, pct } from "../format";
import { SourceTag } from "./ui";

/** Margin as a bullet: bar from zero, indigo when it makes money, red when it loses,
 *  a 1px tick at the target margin. Scale is fixed so cells compare across the table. */
export function MarginBullet({ margin, target, className = "" }: { margin: number | null; target: number; className?: string }) {
  const lo = -0.4;
  const hi = 0.6;
  const x = (v: number) => ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * 100;
  const zero = x(0);
  return (
    <div className={`relative h-1.5 rounded-full bg-rule ${className}`} aria-hidden>
      {margin != null && (
        <div
          className={`absolute inset-y-0 rounded-full ${margin >= 0 ? "bg-indigo" : "bg-negative"}`}
          style={margin >= 0 ? { left: `${zero}%`, width: `${x(margin) - zero}%` } : { left: `${x(margin)}%`, width: `${zero - x(margin)}%` }}
        />
      )}
      <div className="absolute -inset-y-1 w-px bg-ink-2" style={{ left: `${zero}%` }} />
      <div className="absolute -inset-y-1 w-px bg-ink-2/40" style={{ left: `${x(target)}%` }} title={`Target ${pct(target, 0)}`} />
    </div>
  );
}

const COST_BAR = "bg-chart-cost";

/** The shelf price walked down to net profit, one row per cost. Each row also
 *  carries the cost's source, so the chart doubles as the line-item table. */
export function Waterfall({ price, profit, lines, currency }: { price: number; profit: number; lines: Line[]; currency: string }) {
  const min = Math.min(0, profit);
  const span = price - min || 1;
  const x = (v: number) => ((v - min) / span) * 100;
  let running = price;
  const rows = lines.map((l) => {
    const top = running;
    running -= l.amount;
    return { ...l, from: running, to: top };
  });
  const row = "grid grid-cols-[minmax(0,1fr)_88px] sm:grid-cols-[minmax(150px,220px)_minmax(0,1fr)_96px_52px_28px] items-center gap-x-3 py-[7px]";
  return (
    <div role="table" aria-label="Price to profit">
      <div role="row" className={`${row} border-b border-rule pb-2 text-[12px] text-muted`}>
        <span role="columnheader">From the shelf price</span>
        <span role="columnheader" className="hidden sm:block" />
        <span role="columnheader" className="text-right">Amount</span>
        <span role="columnheader" className="hidden text-right sm:block">Of price</span>
        <span role="columnheader" className="hidden sm:block" />
      </div>
      <div role="row" className={`${row} group`}>
        <span role="cell" className="text-ink">Shelf price</span>
        <span role="cell" className="relative hidden h-4 sm:block">
          <span className="absolute inset-y-0 rounded-md bg-active" style={{ left: `${x(0)}%`, width: `${x(price) - x(0)}%` }} />
        </span>
        <span role="cell" className="num text-right font-medium">{money(price, currency)}</span>
        <span role="cell" className="num hidden text-right text-muted sm:block">100%</span>
        <span role="cell" className="hidden sm:block" />
      </div>
      {rows.map((r) => (
        <div role="row" key={r.key} className={`${row} group hover:bg-ground`}>
          <span role="cell" className="truncate text-ink-2" title={r.label}>{r.label}</span>
          <span role="cell" className="relative hidden h-4 sm:block">
            <motion.span
              className={`absolute inset-y-0 rounded-md ${r.key === "vat" ? "bg-chart-vat" : COST_BAR}`}
              initial={{ left: `${x(r.to)}%`, width: 0 }}
              animate={{ left: `${x(r.from)}%`, width: `${Math.max(0.4, x(r.to) - x(r.from))}%` }}
              transition={{ duration: 0.6, delay: 0.05 * rows.indexOf(r), ease: [0.16, 1, 0.3, 1] }}
            />
          </span>
          <span role="cell" className="num text-right text-ink-2">{r.amount ? money(-r.amount, currency) : money(0, currency)}</span>
          <span role="cell" className="num hidden text-right text-muted sm:block">{pct(r.amount / price, 1)}</span>
          <span role="cell" className="hidden justify-end sm:flex"><SourceTag source={r.source} compact /></span>
        </div>
      ))}
      <div role="row" className={`${row} border-t border-border pt-2.5`}>
        <span role="cell" className="font-semibold text-ink">Net profit</span>
        <span role="cell" className="relative hidden h-4 sm:block">
          <motion.span
            className={`absolute inset-y-0 rounded-md ${profit >= 0 ? "bg-indigo" : "bg-negative"}`}
            initial={{ left: `${x(0)}%`, width: 0 }}
            animate={profit >= 0 ? { left: `${x(0)}%`, width: `${x(profit) - x(0)}%` } : { left: `${x(profit)}%`, width: `${x(0) - x(profit)}%` }}
            transition={{ duration: 0.7, delay: 0.05 * rows.length, ease: [0.16, 1, 0.3, 1] }}
          />
          {min < 0 && <span className="absolute -inset-y-1.5 w-px bg-ink" style={{ left: `${x(0)}%` }} />}
        </span>
        <span role="cell" className={`num text-right font-semibold ${profit < 0 ? "text-negative" : "text-ink"}`}>{money(profit, currency, { sign: true })}</span>
        <span role="cell" className="num hidden text-right text-muted sm:block">{pct(profit / price, 1)}</span>
        <span role="cell" className="hidden sm:block" />
      </div>
    </div>
  );
}

/** Each input moved ±15%: red is the profit lost if it moves against you,
 *  indigo the profit gained if it moves your way. Sorted by the swing. */
export function Tornado({ swings, currency }: { swings: Swing[]; currency: string }) {
  if (!swings.length) return <p className="text-[13px] text-muted">Add a market price to see what moves the profit.</p>;
  const base = swings[0].base;
  const lo = Math.min(0, ...swings.map((s) => s.low));
  const hi = Math.max(0, ...swings.map((s) => s.high));
  const span = hi - lo || 1;
  const x = (v: number) => ((v - lo) / span) * 100;
  return (
    <div>
      <div className="relative ml-[118px] mr-2 h-5 text-[11px] text-muted sm:ml-[136px]">
        {lo < 0 && Math.abs(x(base) - x(0)) >= 22 && (
          <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${x(0)}%` }}>Break-even</span>
        )}
        <span className="absolute -translate-x-1/2 whitespace-nowrap text-ink" style={{ left: `${Math.min(88, Math.max(12, x(base)))}%` }}>
          Now {money(base, currency)}
        </span>
      </div>
      <ul className="space-y-1.5">
        {swings.map((s) => (
          <li key={s.key} className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[128px_minmax(0,1fr)]" title={`${s.label}: ${money(s.low, currency)} to ${money(s.high, currency)}`}>
            <span className="truncate text-[13px] text-ink-2">{s.label}</span>
            <span className="relative mr-2 h-6">
              <motion.span className="absolute inset-y-[5px] rounded-l-md bg-negative/80" initial={{ left: `${x(base)}%`, width: 0 }} animate={{ left: `${x(s.low)}%`, width: `${x(base) - x(s.low)}%` }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} />
              <motion.span className="absolute inset-y-[5px] rounded-r-md bg-indigo" initial={{ width: 0 }} animate={{ width: `${x(s.high) - x(base)}%` }} style={{ left: `${x(base)}%` }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} />
              {lo < 0 && <span className="absolute inset-y-0 w-px border-l border-dashed border-ink-2/50" style={{ left: `${x(0)}%` }} />}
              <span className="absolute inset-y-0 w-px bg-ink" style={{ left: `${x(base)}%` }} />
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 ml-[118px] mr-2 flex justify-between text-[11px] text-muted num sm:ml-[136px]">
        <span>{money(lo, currency)}</span>
        <span>{money(hi, currency)}</span>
      </div>
    </div>
  );
}

/** A share of the shelf price as a thin bar under its figure. */
export function ShareCell({ share, strong = false }: { share: number | null; strong?: boolean }) {
  return (
    <span className={`num ${strong ? "font-semibold text-ink" : "text-ink-2"} ${share != null && share < 0 ? "text-negative" : ""}`}>{pct(share, 0)}</span>
  );
}

/** Where the shelf price goes, as one 100% bar. Validated palette (dataviz validator):
 *  adjacent slots pass CVD; three slots are under 3:1, so every segment carries its label. */
export const SHARE_PARTS: { key: string; label: string; color: string; keys: string[] }[] = [
  { key: "product", label: "Product", color: "var(--color-chart-product)", keys: ["product"] },
  { key: "shipping", label: "Shipping", color: "var(--color-chart-shipping)", keys: ["shipping"] },
  { key: "duty", label: "Duty and tariff", color: "var(--color-chart-duty)", keys: ["duty", "tariff"] },
  { key: "fee", label: "Fees", color: "var(--color-chart-fee)", keys: ["fee"] },
  { key: "other", label: "VAT, FX, returns", color: "var(--color-chart-other)", keys: ["vat", "fx", "returns", "ads"] },
  { key: "profit", label: "Profit", color: "var(--color-chart-profit)", keys: [] },
];

export function ShareBar({ shares }: { shares: Record<string, number> }) {
  const parts = SHARE_PARTS.map((p) => ({ ...p, v: Math.max(0, shares[p.key] ?? 0) }));
  const total = parts.reduce((s, p) => s + p.v, 0) || 1;
  return (
    <div className="flex h-7 w-full gap-[2px] overflow-hidden rounded-[10px]" role="img"
      aria-label={parts.map((p) => `${p.label} ${pct(p.v, 0)}`).join(", ")}>
      {parts.map((p, i) => (
        <motion.span
          key={p.key}
          title={`${p.label}: ${pct(p.v, 1)} of the shelf price`}
          initial={{ flexGrow: 0 }}
          whileInView={{ flexGrow: p.v / total }}
          viewport={{ once: true }}
          transition={{ duration: 0.9, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
          className={`relative flex min-w-0 basis-0 items-center justify-center overflow-hidden text-[11px] font-semibold ${p.key === "profit" || p.key === "product" ? "text-white dark:text-black" : "text-white"}`}
          style={{ background: p.color }}
        >
          {p.v / total >= 0.07 && <span className="num drop-shadow-[0_1px_1px_rgb(0_0_0/0.35)]">{pct(p.v, 0)}</span>}
        </motion.span>
      ))}
    </div>
  );
}

/** The cost walk of one lane in miniature, for hover cards. */
export function MiniWaterfall({ price, costs, profit, currency }: { price: number; costs: Record<string, number>; profit: number; currency: string }) {
  const rows = SHARE_PARTS.filter((p) => p.key !== "profit").map((p) => ({ ...p, v: p.keys.reduce((s, k) => s + (costs[k] ?? 0), 0) }));
  const max = Math.max(price, ...rows.map((r) => r.v), Math.abs(profit)) || 1;
  return (
    <div className="space-y-1">
      {[...rows, { key: "profit", label: "Profit", color: profit >= 0 ? "var(--color-chart-profit)" : "var(--color-negative)", v: profit, keys: [] }].map((r) => (
        <div key={r.key} className="grid grid-cols-[96px_1fr_64px] items-center gap-2 text-[12px]">
          <span className={r.key === "profit" ? "font-semibold text-ink" : "text-ink-2"}>{r.label}</span>
          <span className="h-2 rounded-full bg-rule">
            <motion.span className="block h-full rounded-full" style={{ background: r.color }}
              initial={{ width: 0 }} animate={{ width: `${(Math.abs(r.v) / max) * 100}%` }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} />
          </span>
          <span className={`num text-right ${r.key === "profit" && r.v < 0 ? "text-negative" : "text-ink"}`}>{money(r.key === "profit" ? r.v : -r.v, currency, { sign: r.key === "profit" })}</span>
        </div>
      ))}
    </div>
  );
}
