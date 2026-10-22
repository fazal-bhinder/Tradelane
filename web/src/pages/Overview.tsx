import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { RefreshCw, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, CHANNELS, type Catalogue, type Lane, type Product, type User, type Verdict } from "../api";
import { ActivityFeed } from "../components/ActivityFeed";
import { useAnalyst } from "../components/Analyst";
import { MarginBullet, MiniWaterfall, SHARE_PARTS, ShareBar } from "../components/charts";
import { CountUp, Rise } from "../components/Motion";
import { PageTitle } from "../components/Shell";
import { useToast } from "../components/Toast";
import { Bar, Button, DecisionPill, Notice, VerdictPill, inputCls } from "../components/ui";
import { ago, median, money, pct, seconds } from "../format";

type Filter = "all" | Verdict;
const priced = (l: Lane) => l.profit != null && l.price != null && l.margin != null;

function finding(products: Product[]): string | null {
  const lanes = products.flatMap((p) => p.lanes);
  if (!lanes.some(priced)) return null;
  const losing = lanes.filter((l) => priced(l) && (l.profit ?? 0) < 0);
  if (!losing.length) return "Every priced lane makes money at today's prices.";
  const worst = CHANNELS.map((c) => ({ c, lost: losing.filter((l) => l.channel === c.id), all: lanes.filter((l) => l.channel === c.id && priced(l)) }))
    .sort((a, b) => b.lost.length - a.lost.length)[0];
  const share = (keys: string[]) =>
    worst.lost.reduce((s, l) => s + keys.reduce((t, k) => t + (l.costs?.[k] ?? 0), 0), 0) / worst.lost.reduce((s, l) => s + (l.price ?? 0), 0);
  const driver = [
    { name: "shipping", v: share(["shipping"]) }, { name: "duty and tariff", v: share(["duty", "tariff"]) },
    { name: "marketplace fees", v: share(["fee"]) }, { name: "the supplier cost", v: share(["product"]) },
  ].sort((a, b) => b.v - a.v)[0];
  return `${worst.c.name} loses money on ${worst.lost.length} of ${worst.all.length} priced products, and in those ${driver.name} eats ${pct(driver.v, 0)} of the shelf price.`;
}

const VERDICT_COLORS: { id: Verdict; label: string; cls: string }[] = [
  { id: "list", label: "List", cls: "bg-list" },
  { id: "check", label: "Check", cls: "bg-mesh-lavender" },
  { id: "skip", label: "Skip", cls: "bg-ruby" },
  { id: "needs-data", label: "Needs data", cls: "bg-white/25" },
];

function Hero({ data }: { data: Catalogue }) {
  const lanes = data.products.flatMap((p) => p.lanes);
  const list = lanes.filter((l) => l.verdict === "list").length;
  const p = lanes.filter(priced);
  return (
    <section className="panel-navy relative overflow-hidden rounded-panel p-6 shadow-[0_20px_50px_rgb(28_30_84/0.28)] sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-[14px] text-white/70">Lanes worth listing</p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
            <CountUp value={list} className="display text-[64px] leading-none" />
            <span className="text-[15px] text-white/70">of {p.length} priced lanes at a {pct(data.target_margin, 0)} target margin</span>
          </p>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-white/75">
          {VERDICT_COLORS.map((v) => <li key={v.id} className="flex items-center gap-1.5"><span className={`size-2.5 rounded-md ${v.cls}`} />{v.label}</li>)}
        </ul>
      </div>
      <div className="mt-6 space-y-3.5">
        {CHANNELS.map((c, ci) => {
          const mine = lanes.filter((l) => l.channel === c.id);
          const counts = VERDICT_COLORS.map((v) => ({ ...v, n: mine.filter((l) => l.verdict === v.id).length }));
          return (
            <div key={c.id} className="grid grid-cols-[96px_1fr] items-center gap-4 sm:grid-cols-[120px_1fr_96px]">
              <span className="text-[14px] text-white/90">{c.name}</span>
              <div className="flex h-6 gap-[2px] overflow-hidden rounded-lg">
                {counts.map((v, i) => (
                  <motion.span
                    key={v.id}
                    title={`${v.label}: ${v.n}`}
                    initial={{ flexGrow: 0 }}
                    animate={{ flexGrow: v.n }}
                    transition={{ duration: 1, delay: 0.15 + ci * 0.12 + i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                    className={`flex min-w-0 basis-0 items-center justify-center text-[11px] font-semibold ${v.id === "check" ? "text-navy" : v.id === "list" ? "text-white dark:text-black" : "text-white"} ${v.cls}`}
                  >
                    {v.n > 1 && <span className="num">{v.n}</span>}
                  </motion.span>
                ))}
              </div>
              <span className="num hidden text-right text-[13px] text-white/75 sm:block">{pct(median(mine.filter(priced).map((l) => l.margin!)), 1)} median</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BriefCard({ me }: { me: User }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: brief, isLoading } = useQuery({ queryKey: ["brief"], queryFn: api.brief });
  const write = useMutation({
    mutationFn: api.writeBrief,
    onSuccess: (b) => { qc.setQueryData(["brief"], b); qc.invalidateQueries({ queryKey: ["activity"] }); toast(`Brief written in ${seconds(b.ms)} and saved`); },
    onError: (e) => toast((e as Error).message, "error"),
  });
  const lines = (brief?.text ?? "").split("\n").map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
  return (
    <section className="flex h-full flex-col rounded-panel border border-border bg-surface p-5 shadow-[0_1px_3px_rgb(0_55_112/0.08)]">
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold"><Sparkles size={16} className="text-indigo" /> Today's brief</h2>
        {brief && (
          <button onClick={() => write.mutate()} disabled={write.isPending} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] text-ink-2 hover:bg-raised disabled:opacity-60">
            <RefreshCw size={13} className={write.isPending ? "animate-spin" : ""} /> Rewrite
          </button>
        )}
      </header>
      <div className="mt-3 flex-1">
        {write.isPending ? (
          <div className="space-y-3 pt-1" aria-busy="true">
            <p className="thinking text-[14px]">Reading every lane and writing the brief…</p>
            {[92, 80, 86].map((w, i) => <div key={i} className="h-3 rounded-full bg-raised" style={{ width: `${w}%` }} />)}
          </div>
        ) : isLoading ? (
          <div className="space-y-3 pt-1">{[90, 80, 70].map((w, i) => <div key={i} className="h-3 rounded-full bg-raised" style={{ width: `${w}%` }} />)}</div>
        ) : lines.length ? (
          <ul className="space-y-3">
            {lines.map((l, i) => (
              <motion.li key={l} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.12 }} className="flex gap-2.5 text-[14px] leading-[21px] text-ink-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-indigo" />
                <span>{l}</span>
              </motion.li>
            ))}
          </ul>
        ) : (
          <div className="flex h-full flex-col items-start justify-center gap-3">
            <p className="text-[14px] text-ink-2">The AI reads every lane and writes three lines: what works, what loses money and why, and what to do first.</p>
            <Button kind="primary" onClick={() => write.mutate()}><Sparkles size={14} /> Write today's brief</Button>
          </div>
        )}
      </div>
      {brief && !write.isPending && (
        <p className="mt-4 border-t border-rule pt-3 text-[12px] text-muted">
          {brief.by === "template" ? "Template (AI off)" : "Written by AI"} · for {brief.for === me.id ? "you" : brief.for} · {ago(brief.at)} · {seconds(brief.ms)}
        </p>
      )}
    </section>
  );
}

function Kpis({ data }: { data: Catalogue }) {
  const lanes = data.products.flatMap((p) => p.lanes);
  const p = lanes.filter(priced);
  const cells = [
    { label: "Median margin", value: median(p.map((l) => l.margin!)), fmt: (v: number) => pct(v, 1), sub: "net profit over net revenue" },
    { label: "Losing money", value: p.filter((l) => (l.profit ?? 0) < 0).length, sub: "lanes after duty, fees and returns", tone: "text-negative" },
    { label: "Waiting for a decision", value: lanes.filter((l) => !l.review && l.verdict !== "needs-data").length, sub: "in the approver's queue" },
    { label: "Approved to list", value: lanes.filter((l) => l.review?.decision === "approved").length, sub: `${lanes.filter((l) => l.review?.decision === "rejected").length} rejected` },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cells.map((c, i) => (
        <Rise key={c.label} delay={i * 0.06}>
          <div className="rounded-card border border-border bg-surface px-4 py-3.5 sm:px-5">
            <p className="text-[13px] text-muted">{c.label}</p>
            <CountUp value={c.value} format={c.fmt} className={`figure mt-1 block text-[30px] leading-9 ${c.tone && c.value ? c.tone : "text-ink"}`} />
            <p className="mt-0.5 text-[12px] text-muted">{c.sub}</p>
          </div>
        </Rise>
      ))}
    </div>
  );
}

function Shares({ products }: { products: Product[] }) {
  return (
    <section className="rounded-panel border border-border bg-surface p-5">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Where the shelf price goes</h2>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-2">
          {SHARE_PARTS.map((p) => <li key={p.key} className="flex items-center gap-1.5"><span className="size-2.5 rounded-md" style={{ background: p.color }} />{p.label}</li>)}
        </ul>
      </header>
      <div className="space-y-3.5">
        {CHANNELS.map((c) => {
          const lanes = products.flatMap((p) => p.lanes).filter((l) => l.channel === c.id && priced(l));
          const total = lanes.reduce((s, l) => s + (l.price ?? 0), 0) || 1;
          const shares = Object.fromEntries(SHARE_PARTS.map((p) => [p.key, p.key === "profit"
            ? lanes.reduce((s, l) => s + (l.profit ?? 0), 0) / total
            : lanes.reduce((s, l) => s + p.keys.reduce((t, k) => t + (l.costs?.[k] ?? 0), 0), 0) / total]));
          return (
            <div key={c.id} className="grid grid-cols-1 gap-1.5 sm:grid-cols-[120px_1fr] sm:items-center sm:gap-4">
              <span className="text-[14px] text-ink">{c.name} <span className="text-[12px] text-muted">{lanes.length} products</span></span>
              <ShareBar shares={shares} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function LaneCell({ lane, target }: { lane: Lane | undefined; target: number }) {
  if (!lane) return <span className="text-muted">No route</span>;
  if (lane.verdict === "needs-data") {
    return <div><VerdictPill verdict="needs-data" /><p className="mt-1 truncate text-[13px] text-muted">Missing {lane.missing.join(", ")}</p></div>;
  }
  if (lane.price == null) {
    return <div><p className="text-[13px] text-ink-2">No market price</p><p className="num mt-0.5 text-[13px] text-muted">Lists at {money(lane.target_price, lane.currency)}</p></div>;
  }
  return (
    <div className="group/cell relative">
      <div className="flex items-center justify-between gap-2">
        <span className={`figure text-[19px] leading-6 ${lane.margin! < 0 ? "text-negative" : "text-ink"}`}>{pct(lane.margin, 1)}</span>
        {lane.review ? <DecisionPill decision={lane.review.decision} /> : <VerdictPill verdict={lane.verdict} />}
      </div>
      <MarginBullet margin={lane.margin} target={target} className="mt-1.5" />
      <p className="num mt-1.5 text-[13px] text-muted">{money(lane.profit, lane.currency, { sign: true })} on {money(lane.price, lane.currency)}</p>
      {lane.costs && (
        <div className="pointer-events-none invisible absolute top-full left-1/2 z-20 mt-2 w-[300px] -translate-x-1/2 translate-y-1 rounded-card border border-border bg-surface p-3.5 opacity-0 shadow-[0_16px_40px_rgb(13_37_61/0.18)] transition-all duration-200 group-hover/cell:visible group-hover/cell:translate-y-0 group-hover/cell:opacity-100">
          <p className="mb-2 text-[12px] font-medium text-ink">{CHANNELS.find((c) => c.id === lane.channel)?.name}: where {money(lane.price, lane.currency)} goes</p>
          <MiniWaterfall price={lane.price} costs={lane.costs} profit={lane.profit!} currency={lane.currency} />
        </div>
      )}
    </div>
  );
}

const bestMargin = (p: Product) => Math.max(...p.lanes.map((l) => (l.margin == null ? -9 : l.margin)));

function Matrix({ data }: { data: Catalogue }) {
  const nav = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"best" | "worst" | "name">("best");
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data.products.length };
    for (const v of ["list", "check", "skip", "needs-data"]) c[v] = data.products.filter((p) => p.lanes.some((l) => l.verdict === v)).length;
    return c;
  }, [data]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = data.products.filter((p) => (filter === "all" || p.lanes.some((l) => l.verdict === filter)) && (!needle || `${p.name} ${p.sku} ${p.supplier}`.toLowerCase().includes(needle)));
    return out.sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : sort === "best" ? bestMargin(b) - bestMargin(a) : bestMargin(a) - bestMargin(b)));
  }, [data, filter, q, sort]);
  const tabs: { id: Filter; label: string }[] = [
    { id: "all", label: "All" }, { id: "list", label: "Has a List lane" }, { id: "check", label: "To check" },
    { id: "skip", label: "Loses somewhere" }, { id: "needs-data", label: "Needs data" },
  ];
  return (
    <section className="rounded-panel border border-border bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5">
        <h2 className="text-[15px] font-semibold">Margin by product and marketplace</h2>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <label className="relative block min-w-0 flex-1 sm:flex-none">
            <span className="sr-only">Search products</span>
            <Search size={15} strokeWidth={1.6} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, SKU, supplier" className={`${inputCls} h-9 w-full pl-8 sm:h-8 sm:w-[220px]`} />
          </label>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={`${inputCls} h-9 w-[150px] shrink-0 pr-8 sm:h-8 sm:w-auto`} aria-label="Sort">
            <option value="best">Best margin first</option>
            <option value="worst">Worst margin first</option>
            <option value="name">Name</option>
          </select>
        </div>
      </header>
      <div className="mt-3 flex gap-5 overflow-x-auto border-b border-border px-5" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={filter === t.id} onClick={() => setFilter(t.id)}
            className={`relative -mb-px flex shrink-0 items-center gap-1.5 py-2.5 text-[13px] whitespace-nowrap transition-colors ${filter === t.id ? "font-medium text-ink" : "text-muted hover:text-ink-2"}`}>
            {t.label}<span className="num text-muted">{counts[t.id]}</span>
            {filter === t.id && <motion.span layoutId="matrix-tab" className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-indigo" />}
          </button>
        ))}
      </div>
      <div className="hidden md:block">
        <table className="w-full table-fixed text-[14px]">
          <colgroup><col className="w-[32%]" />{CHANNELS.map((c) => <col key={c.id} />)}</colgroup>
          <thead>
            <tr className="text-[12px] text-muted">
              <th className="px-5 py-2.5 text-left font-normal">Product</th>
              {CHANNELS.map((c) => <th key={c.id} className="px-4 py-2.5 text-left font-normal">{c.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <motion.tr key={p.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 12) * 0.02 }}
                onClick={() => nav(`/products/${p.id}`)} className="cursor-pointer border-t border-rule align-top transition-colors hover:bg-ground">
                <td className="px-5 py-3">
                  <Link to={`/products/${p.id}`} className="font-medium text-ink hover:text-indigo" onClick={(e) => e.stopPropagation()}>{p.name}</Link>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-muted">
                    {p.sku} · from {p.origin === "IN" ? "India" : "UK"}
                    {p.category_kind === "ai" && <span className="inline-flex items-center gap-0.5 rounded-full bg-indigo-pale px-1.5 text-indigo-press"><Sparkles size={10} /> AI category</span>}
                  </p>
                </td>
                {CHANNELS.map((c) => <td key={c.id} className="px-4 py-3"><LaneCell lane={p.lanes.find((l) => l.channel === c.id)} target={data.target_margin} /></td>)}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="md:hidden">
        {rows.map((p) => (
          <li key={p.id} className="border-t border-rule first:border-t-0">
            <Link to={`/products/${p.id}`} className="block px-4 py-3">
              <p className="font-medium">{p.name}</p>
              <p className="text-[12px] text-muted">{p.sku} · from {p.origin === "IN" ? "India" : "UK"}</p>
              <div className="mt-2 space-y-1.5">
                {p.lanes.map((l) => (
                  <div key={l.channel} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="text-ink-2">{CHANNELS.find((c) => c.id === l.channel)?.name}</span>
                    <span className="flex items-center gap-2">
                      <span className={`num ${l.margin != null && l.margin < 0 ? "text-negative" : ""}`}>{l.price == null ? "No price" : pct(l.margin, 1)}</span>
                      {l.review ? <DecisionPill decision={l.review.decision} /> : <VerdictPill verdict={l.verdict} />}
                    </span>
                  </div>
                ))}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {!rows.length && <p className="border-t border-rule px-5 py-6 text-[13px] text-muted">No products match this view.</p>}
      <p className="border-t border-rule px-5 py-3 text-[12px] text-muted">{rows.length} of {data.products.length} products. Hover a margin to see where the money goes; the tick is the {pct(data.target_margin, 0)} target.</p>
    </section>
  );
}

function FirstRun() {
  const qc = useQueryClient();
  const toast = useToast();
  const sample = useMutation({ mutationFn: api.sample, onSuccess: (r) => { qc.invalidateQueries(); toast(`Loaded ${r.imported} products`); } });
  return (
    <section className="rounded-panel border border-border bg-surface p-6">
      <h2 className="text-[18px] font-semibold">No products yet</h2>
      <p className="mt-1 max-w-[60ch] text-ink-2">Import a supplier sheet, or load the sample: 30 products from Indian and UK suppliers.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button kind="primary" onClick={() => sample.mutate()} disabled={sample.isPending}>{sample.isPending ? "Loading…" : "Load the 30-product sample"}</Button>
        <Link to="/import"><Button>Import a supplier sheet</Button></Link>
      </div>
    </section>
  );
}

export default function Overview({ me }: { me: User }) {
  const analyst = useAnalyst();
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ["catalogue"], queryFn: api.catalogue });
  const hour = new Date().getHours();
  const hello = `Good ${hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"}, ${me.name.split(" ")[0]}`;
  if (isLoading) {
    return <div aria-busy="true"><Bar className="h-12 w-72" /><Bar className="mt-8 block h-56 w-full" /><Bar className="mt-4 block h-96 w-full" /></div>;
  }
  if (isError || !data) {
    return <><PageTitle title="Catalogue" /><Notice tone="error">Couldn't load the catalogue: {(error as Error)?.message}. <button className="underline" onClick={() => refetch()}>Retry</button></Notice></>;
  }
  const waiting = data.products.flatMap((p) => p.lanes).filter((l) => !l.review && l.verdict !== "needs-data").length;
  return (
    <>
      <PageTitle
        eyebrow={<p className="mb-2 text-[14px] font-medium text-indigo">{hello}</p>}
        title="Catalogue"
        sub={data.products.length ? (
          <span>
            {finding(data.products)}{" "}
            <button onClick={() => analyst({ question: "Why are those lanes losing money, and which ones can be saved by a better price?" })} className="font-medium text-indigo hover:underline">Ask why</button>
          </span>
        ) : "Start with a supplier sheet or the sample catalogue."}
        actions={data.products.length ? (
          <Link to="/review"><Button kind={me.role === "approver" ? "primary" : "secondary"}>{waiting ? `Review ${waiting} lanes` : "Open review"}</Button></Link>
        ) : null}
      />
      {!data.products.length ? <FirstRun /> : (
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            <Rise><Hero data={data} /></Rise>
            <Rise delay={0.08} className="h-full"><BriefCard me={me} /></Rise>
          </div>
          <Kpis data={data} />
          <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            <div className="min-w-0 space-y-4">
              <Rise><Shares products={data.products} /></Rise>
              <Matrix data={data} />
            </div>
            <aside className="xl:sticky xl:top-6 xl:self-start">
              <section className="rounded-panel border border-border bg-surface p-4">
                <header className="mb-2 flex items-center justify-between px-1">
                  <h2 className="flex items-center gap-2 text-[15px] font-semibold"><span className="size-2 rounded-full bg-positive motion-safe:animate-pulse-dot" />Live activity</h2>
                  <Link to="/activity" className="text-[12px] text-indigo hover:underline">See all</Link>
                </header>
                <ActivityFeed limit={14} />
              </section>
            </aside>
          </div>
        </div>
      )}
    </>
  );
}
