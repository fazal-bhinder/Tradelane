const SYMBOL: Record<string, string> = { USD: "$", GBP: "£", INR: "₹" };

/** £12.34, -$3.20. Money always has two decimals and no space after the sign. */
export function money(v: number | null | undefined, currency: string, opts: { sign?: boolean } = {}): string {
  if (v == null || Number.isNaN(v)) return "—";
  const s = SYMBOL[currency] ?? `${currency} `;
  const abs = Math.abs(v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = v < 0 ? "−" : opts.sign && v > 0 ? "+" : "";
  return `${sign}${s}${abs}`;
}

export function pct(v: number | null | undefined, digits = 1, opts: { sign?: boolean } = {}): string {
  if (v == null || Number.isNaN(v)) return "—";
  const sign = v < 0 ? "−" : opts.sign && v > 0 ? "+" : "";
  return `${sign}${Math.abs(v * 100).toFixed(digits)}%`;
}

export function num(v: number | null | undefined, digits = 0): string {
  if (v == null) return "—";
  return v.toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function relDate(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return `Today ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  if (days === 1) return "Yesterday";
  return d.toISOString().slice(0, 10);
}

/** "just now", "4 min ago", "2 h ago", then the date. */
export function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}
