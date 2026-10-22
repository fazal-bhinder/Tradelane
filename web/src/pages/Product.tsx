import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { ChevronLeft, Lock, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, CHANNELS, type Lane, type Product, type User } from "../api";
import { ActivityFeed } from "../components/ActivityFeed";
import { useAnalyst } from "../components/Analyst";
import { firstName } from "../components/Avatar";
import { Tornado, Waterfall } from "../components/charts";
import { CountUp } from "../components/Motion";
import { PageTitle } from "../components/Shell";
import { useToast } from "../components/Toast";
import { Bar, Button, Card, DecisionPill, Field, Notice, SourceTag, VerdictPill, inputCls } from "../components/ui";
import { money, num, pct, relDate, seconds } from "../format";

const CATS: Record<string, string> = {
  home: "Home & decor", kitchen: "Kitchen & dining", beauty: "Beauty & personal care", clothing: "Clothing & accessories",
  jewelry: "Jewellery", toys: "Toys & games", sports: "Sports & outdoors",
};

function useSave(id: number) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.patch>[1]) => api.patch(id, body),
    onSuccess: (p) => {
      qc.setQueryData(["product", id], p);
      qc.invalidateQueries({ queryKey: ["catalogue"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
      toast("Saved and recalculated");
    },
    onError: (e) => toast((e as Error).message, "error"),
  });
}

function LaneTabs({ p, active, onPick }: { p: Product; active: string; onPick: (c: string) => void }) {
  return (
    <div className="mb-4 grid grid-cols-3 gap-3" role="tablist" aria-label="Marketplace">
      {p.lanes.map((l) => {
        const on = l.channel === active;
        return (
          <button
            key={l.channel}
            role="tab"
            aria-selected={on}
            onClick={() => onPick(l.channel)}
            className={`relative overflow-hidden rounded-card border px-4 py-3.5 text-left transition-all sm:px-5 ${on ? "border-indigo bg-surface shadow-[0_10px_28px_rgb(83_58_253/0.14)]" : "border-border bg-surface/80 hover:border-control hover:bg-surface"}`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className={`text-[13px] ${on ? "font-medium text-ink" : "text-ink-2"}`}>{CHANNELS.find((c) => c.id === l.channel)?.name}</span>
              <span className="hidden sm:inline">{l.review ? <DecisionPill decision={l.review.decision} /> : <VerdictPill verdict={l.verdict} />}</span>
            </span>
            <span className={`figure mt-1 block text-[24px] leading-8 sm:text-[32px] ${l.margin != null && l.margin < 0 ? "text-negative" : "text-ink"}`}>
              {l.margin == null ? "—" : <CountUp value={l.margin} format={(v) => pct(v, 1)} />}
            </span>
            <span className="num mt-0.5 block text-[12px] text-muted">
              {l.profit == null ? (l.verdict === "needs-data" ? "Needs data" : "No price") : `${money(l.profit, l.currency, { sign: true })} a sale`}
            </span>
            {on && <motion.span layoutId="lane-on" className="absolute inset-x-0 bottom-0 h-[3px] bg-indigo" />}
          </button>
        );
      })}
    </div>
  );
}

function Decision({ p, lane, me }: { p: Product; lane: Lane; me: User }) {
  const qc = useQueryClient();
  const toast = useToast();
  const save = useSave(p.id);
  const [price, setPrice] = useState(lane.price?.toString() ?? "");
  const [note, setNote] = useState("");
  useEffect(() => setPrice(lane.price?.toString() ?? ""), [lane.price, lane.channel]);
  const decide = useMutation({
    mutationFn: (decision: "approved" | "rejected") => api.review({ product_id: p.id, channel: lane.channel, decision, note }),
    onSuccess: (_, decision) => {
      setNote("");
      qc.invalidateQueries();
      toast(`${decision === "approved" ? "Approved" : "Rejected"} by ${me.name.split(" ")[0]}, saved with the numbers it was decided on`);
    },
    onError: (e) => toast((e as Error).message, "error"),
  });
  const dirty = price !== (lane.price?.toString() ?? "");
  const approver = me.role === "approver";
  return (
    <Card className="h-full" title="Decision" aside={lane.review ? <DecisionPill decision={lane.review.decision} /> : <VerdictPill verdict={lane.verdict} />}>
      {lane.reasons.length > 0 && <p className="mb-4 text-[13px] text-ink-2">{lane.reasons.join(". ")}.</p>}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = price.trim() === "" ? null : Number(price);
          if (v !== null && !(v > 0)) return;
          save.mutate({ prices: { [lane.channel]: v } });
        }}
      >
        <div className="flex-1">
          <Field label={`Shelf price (${lane.currency}${lane.currency === "GBP" ? ", VAT included" : ""})`}>
            <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={`${inputCls} w-full`} placeholder="What it sells for" />
          </Field>
        </div>
        <Button type="submit" disabled={!dirty || save.isPending}>{save.isPending ? "Saving…" : "Update"}</Button>
      </form>
      <dl className="mt-4 grid grid-cols-2 gap-y-2 text-[13px]">
        <dt className="text-muted">Break-even price</dt>
        <dd className="num text-right text-ink">{money(lane.break_even, lane.currency)}</dd>
        <dt className="text-muted">Price for target margin</dt>
        <dd className="num text-right font-medium text-ink">
          {lane.target_price != null && lane.price !== lane.target_price ? (
            <button className="text-indigo hover:underline" onClick={() => setPrice(lane.target_price!.toString())} title="Use this price">{money(lane.target_price, lane.currency)}</button>
          ) : money(lane.target_price, lane.currency)}
        </dd>
        <dt className="text-muted">Net revenue</dt>
        <dd className="num text-right text-ink">{money(lane.net_revenue, lane.currency)}</dd>
      </dl>
      <div className="mt-5 border-t border-rule pt-4">
        {approver ? (
          <>
            <Field label="Note for the decision">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} className={`${inputCls} h-auto w-full py-2`} placeholder="Why, in a line (optional)" />
            </Field>
            <div className="mt-3 flex gap-2">
              <Button kind="primary" disabled={decide.isPending || lane.verdict === "needs-data"} onClick={() => decide.mutate("approved")}>Approve to list</Button>
              <Button disabled={decide.isPending} onClick={() => decide.mutate("rejected")}>Reject</Button>
            </div>
            {lane.verdict === "needs-data" && <p className="mt-2 text-[12px] text-muted">Fill in {lane.missing.join(", ")} before approving.</p>}
          </>
        ) : (
          <p className="flex items-start gap-2 rounded-control bg-ground px-3 py-2.5 text-[13px] text-ink-2">
            <Lock size={14} className="mt-0.5 shrink-0 text-muted" />
            Only an approver decides a lane. Switch to Rohan in the sidebar to approve or reject it.
          </p>
        )}
        {lane.review && (
          <p className="mt-3 text-[12px] text-muted">
            {lane.review.decision === "approved" ? "Approved" : "Rejected"} by {firstName(lane.review.by)} {relDate(lane.review.at)}{lane.review.note ? `: “${lane.review.note}”` : ""}
          </p>
        )}
      </div>
    </Card>
  );
}

function AiCard({ p }: { p: Product }) {
  const qc = useQueryClient();
  const toast = useToast();
  const classify = useMutation({
    mutationFn: () => api.classify(p.id),
    onSuccess: (np) => {
      qc.setQueryData(["product", p.id], np);
      qc.invalidateQueries({ queryKey: ["catalogue"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
      toast(`Classified as ${CATS[np.category ?? "home"]?.toLowerCase()} in ${seconds(np.ai.ms ?? 0)}`);
    },
    onError: (e) => toast((e as Error).message, "error"),
  });
  const ai = p.ai;
  return (
    <section className="relative h-full overflow-hidden rounded-card border border-border bg-surface p-5">
      <div className="pointer-events-none absolute -top-12 -right-10 h-32 w-56 rounded-full bg-mesh-lavender opacity-50 blur-3xl dark:hidden" />
      <header className="relative flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold"><Sparkles size={16} className="text-indigo" /> AI suggestion</h2>
        <Button kind={ai.by ? "ghost" : "primary"} className="h-7 px-3" onClick={() => classify.mutate()} disabled={classify.isPending}>
          {classify.isPending ? "Working…" : ai.by ? "Run again" : "Classify with AI"}
        </Button>
      </header>
      <div className="relative mt-3">
        {classify.isPending ? (
          <div className="space-y-2.5 py-1" aria-busy="true">
            <p className="thinking text-[14px]">Reading the material and use, then picking the HS code…</p>
            {[86, 70, 78].map((w, i) => <div key={i} className="h-3 rounded-full bg-raised" style={{ width: `${w}%` }} />)}
          </div>
        ) : ai.by ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div>
                <p className="text-[12px] text-muted">Category</p>
                <p className="text-[15px] font-medium">{CATS[ai.category ?? ""] ?? "—"}</p>
              </div>
              <div>
                <p className="text-[12px] text-muted">HS code</p>
                <p className="num text-[15px] font-medium">{ai.hs_code}</p>
              </div>
              <div className="min-w-[140px] flex-1">
                <p className="text-[12px] text-muted">Confidence {pct(ai.confidence ?? 0, 0)}</p>
                <div className="mt-1.5 h-1.5 rounded-full bg-rule">
                  <motion.div className="h-full rounded-full bg-indigo" initial={{ width: 0 }} animate={{ width: `${(ai.confidence ?? 0) * 100}%` }} transition={{ duration: 0.8 }} />
                </div>
              </div>
            </div>
            {ai.reasoning && <p className="mt-3 text-[13px] leading-5 text-ink-2">{ai.reasoning}</p>}
            <div className="mt-4 rounded-control bg-ground p-3.5">
              <p className="text-[12px] font-medium text-muted">Listing draft</p>
              <p className="mt-1 text-[14px] text-ink">{ai.title}</p>
              <ul className="mt-2 space-y-1 text-[13px] text-ink-2">
                {ai.bullets?.map((b) => <li key={b} className="flex gap-2"><span className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-2" />{b}</li>)}
              </ul>
            </div>
            <p className="mt-3 text-[12px] text-muted">
              {ai.by === "keyword match" ? "Keyword match (AI off)" : "AI suggestion"}{ai.ms ? ` · ${seconds(ai.ms)}` : ""} · the category stays unconfirmed until a person chooses it
            </p>
          </motion.div>
        ) : (
          <p className="text-[13px] text-ink-2">Let the AI read this product and suggest the marketplace category, the HS code that sets its US duty, and a listing draft.</p>
        )}
      </div>
    </section>
  );
}

function Facts({ p }: { p: Product }) {
  const save = useSave(p.id);
  const [hs, setHs] = useState(p.hs_code ?? "");
  useEffect(() => setHs(p.hs_code ?? ""), [p.hs_code]);
  const kindSource = { kind: p.category_kind, label: p.category_kind === "fact" ? "Confirmed" : p.category_kind === "ai" ? "AI suggestion, not confirmed" : p.category_kind === "assumption" ? "Keyword match, not confirmed" : "No category", url: null, checked: null };
  const [l, w, h] = p.dims_cm;
  const vol = l && w && h ? (l * w * h) / 5000 : null;
  return (
    <Card className="h-full" title="Product">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" hint={<span className="inline-flex items-center gap-1.5"><SourceTag source={kindSource} /> {p.category_kind !== "fact" && p.category && "Choosing confirms it"}</span>}>
          <select value={p.category ?? ""} onChange={(e) => save.mutate({ category: e.target.value })} className={`${inputCls} w-full`}>
            {!p.category && <option value="">Choose a category</option>}
            {Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {p.category && p.category_kind !== "fact" && (
            <button type="button" className="mt-1.5 text-[12px] font-medium text-indigo" onClick={() => save.mutate({ category: p.category! })}>
              Confirm {CATS[p.category].toLowerCase()}
            </button>
          )}
        </Field>
        <form onSubmit={(e) => { e.preventDefault(); save.mutate({ hs_code: hs.trim() || null }); }}>
          <Field
            label="HS code"
            hint={p.us_mfn == null ? "US duty uses the category's typical rate"
              : (p.hs_code ?? "").replace(/\D/g, "").length < 8
                ? `US duty ${pct(p.us_mfn, 1)}: the highest line under this heading (${p.us_mfn_line}). Enter 8–10 digits for the exact rate.`
                : `US HTS ${p.us_mfn_line}: ${pct(p.us_mfn, 1)} duty`}
          >
            <div className="flex gap-2">
              <input value={hs} onChange={(e) => setHs(e.target.value)} className={`${inputCls} w-full`} placeholder="6 digits" />
              <Button type="submit" disabled={hs === (p.hs_code ?? "") || save.isPending}>Look up</Button>
            </div>
          </Field>
        </form>
      </div>
      <dl className="mt-5 grid grid-cols-[minmax(0,1fr)_auto] gap-y-2 text-[13px]">
        <dt className="text-muted">Supplier cost</dt>
        <dd className="num text-right">{money(p.unit_cost, p.cost_currency)}</dd>
        <dt className="text-muted">Weight</dt>
        <dd className="num text-right">{p.weight_kg == null ? <span className="text-negative">Missing</span> : `${num(p.weight_kg, 2)} kg`}</dd>
        <dt className="text-muted">Parcel size</dt>
        <dd className="num text-right">{l && w && h ? `${num(l)} × ${num(w)} × ${num(h)} cm` : "—"}{vol != null && p.weight_kg != null && vol > p.weight_kg && <span className="ml-1.5 text-muted">({num(vol, 2)} kg by volume)</span>}</dd>
        <dt className="text-muted">Ships from</dt>
        <dd className="text-right">{p.origin === "IN" ? "India" : "United Kingdom"}</dd>
        <dt className="text-muted">Supplier</dt>
        <dd className="text-right">{p.supplier || "—"}</dd>
      </dl>
    </Card>
  );
}

export default function ProductPage({ me }: { me: User }) {
  const id = Number(useParams().id);
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const analyst = useAnalyst();
  const [params, setParams] = useSearchParams();
  const { data: p, isLoading, isError, error } = useQuery({ queryKey: ["product", id], queryFn: () => api.product(id) });
  const remove = useMutation({ mutationFn: () => api.remove(id), onSuccess: () => { qc.invalidateQueries(); toast("Deleted"); nav("/"); } });

  if (isLoading) return <div aria-busy="true"><Bar className="h-12 w-96" /><Bar className="mt-6 block h-28 w-full" /><Bar className="mt-4 block h-80 w-full" /></div>;
  if (isError || !p) return <Notice tone="error">Couldn't load this product: {(error as Error)?.message}</Notice>;

  const active = params.get("lane") && p.lanes.some((l) => l.channel === params.get("lane")) ? params.get("lane")! : p.lanes[0]?.channel;
  const lane = p.lanes.find((l) => l.channel === active)!;

  return (
    <>
      <Link to="/" className="mb-3 inline-flex items-center gap-1 text-[13px] text-ink-2 hover:text-ink"><ChevronLeft size={15} strokeWidth={1.6} />Catalogue</Link>
      <PageTitle
        title={p.name}
        sub={<span className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="num rounded-full bg-surface/80 px-2 py-0.5 text-[12px] text-ink-2 ring-1 ring-border">{p.sku}</span><span>{p.description || "No description"}</span></span>}
        actions={
          <>
            <Button kind="ghost" onClick={() => { if (confirm(`Delete ${p.name}?`)) remove.mutate(); }}>Delete</Button>
            <Button onClick={() => analyst({ sku: p.sku, productName: p.name })}><Sparkles size={14} className="text-indigo" /> Ask about this product</Button>
          </>
        }
      />
      <LaneTabs p={p} active={active} onPick={(c) => setParams({ lane: c }, { replace: true })} />
      <div className="grid gap-4 lg:grid-cols-6">
        <div className="lg:col-span-4">
          <Card className="h-full" title={`${lane.lane}: price to profit`} aside={lane.price != null ? `${money(lane.price, lane.currency)} shelf price` : undefined}>
            {lane.price != null && lane.profit != null && lane.lines?.length ? (
              <Waterfall key={lane.channel} price={lane.price} profit={lane.profit} lines={lane.lines} currency={lane.currency} />
            ) : (
              <p className="text-[13px] text-ink-2">
                {lane.verdict === "needs-data" ? `Add ${lane.missing.join(", ")} to work out this lane.` : `No market price yet. To make the target margin it needs to sell for ${money(lane.target_price, lane.currency)}; to break even, ${money(lane.break_even, lane.currency)}.`}
              </p>
            )}
          </Card>
        </div>
        <div className="lg:col-span-2"><Decision p={p} lane={lane} me={me} /></div>
        <div className="lg:col-span-3">
          <Card className="h-full" title="What moves the profit" aside="Each input moved 15% either way">
            <Tornado key={lane.channel} swings={lane.sensitivity ?? []} currency={lane.currency} />
          </Card>
        </div>
        <div className="lg:col-span-3"><AiCard p={p} /></div>
        <div className="lg:col-span-3"><Facts p={p} /></div>
        <div className="lg:col-span-3">
          <Card className="h-full" title="History" aside="Who changed what">
            <ActivityFeed limit={100} productId={p.id} compact />
          </Card>
        </div>
      </div>
    </>
  );
}
