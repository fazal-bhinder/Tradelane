import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Check, FileSpreadsheet, LoaderCircle, Sparkles, X } from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { PageTitle } from "../components/Shell";
import { useToast } from "../components/Toast";
import { Button, Card, Notice } from "../components/ui";
import { pct, seconds } from "../format";

const COLUMNS: [string, string, string][] = [
  ["name", "Required", "Product name as the supplier writes it"],
  ["unit_cost", "Required", "Cost per unit, in cost_currency"],
  ["weight_kg", "Required", "Packed weight"],
  ["origin", "IN or GB", "Where it ships from; defaults to IN"],
  ["sku, description, supplier", "Optional", "The description helps the AI pick the HS code"],
  ["cost_currency", "Optional", "INR, GBP or USD; defaults by origin"],
  ["length_cm, width_cm, height_cm", "Optional", "Parcel size, for volumetric weight"],
  ["category", "Optional", "home, kitchen, beauty, clothing, jewelry, toys or sports; leave empty for the AI"],
  ["hs_code", "Optional", "6 to 10 digits; looks up the exact US duty"],
  ["price_amazon_uk, price_amazon_us, price_walmart_us", "Optional", "What it sells for there; UK prices include VAT"],
];

type Row = { id: number; name: string; state: "waiting" | "working" | "done" | "failed"; category?: string; hs?: string; confidence?: number; ms?: number; error?: string };

/** Classifies one product per request (each call stays inside the serverless time limit)
 *  and shows every row as the model answers it. */
function ClassifyAll() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({ queryKey: ["catalogue"], queryFn: api.catalogue });
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: api.health });
  const [rows, setRows] = useState<Row[] | null>(null);
  const todo = data?.products.filter((p) => p.category_kind === "unknown" || !p.ai.by) ?? [];
  if (!data?.products.length) return null;
  const model = health?.ai ? "AI" : "Keyword match (AI off)";

  const run = async () => {
    const list: Row[] = todo.map((p) => ({ id: p.id, name: p.name, state: "waiting" }));
    setRows(list);
    const set = (id: number, patch: Partial<Row>) => setRows((rs) => rs!.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    let ok = 0;
    for (const r of list) {
      set(r.id, { state: "working" });
      try {
        const p = await api.classify(r.id);
        ok++;
        set(r.id, { state: "done", category: p.ai.category, hs: p.ai.hs_code, confidence: p.ai.confidence, ms: p.ai.ms });
        qc.invalidateQueries({ queryKey: ["activity"] });
      } catch (e) {
        set(r.id, { state: "failed", error: (e as Error).message });
      }
    }
    qc.invalidateQueries();
    toast(`Classified ${ok} of ${list.length} products`);
  };
  const running = rows?.some((r) => r.state === "working" || r.state === "waiting");
  const done = rows?.filter((r) => r.state === "done").length ?? 0;

  return (
    <section className="relative overflow-hidden rounded-panel border border-border bg-surface p-5">
      <div className="pointer-events-none absolute -top-14 -right-12 h-36 w-64 rounded-full bg-mesh-lavender opacity-50 blur-3xl dark:hidden" />
      <header className="relative flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold"><Sparkles size={16} className="text-indigo" /> Classify with AI</h2>
        <span className="rounded-full bg-indigo-pale px-2 py-0.5 text-[12px] text-indigo-press">{model}</span>
      </header>
      <p className="relative mt-2 text-[14px] text-ink-2">
        {todo.length || rows
          ? "The model reads each product's name and description and suggests its marketplace category, the HS code that sets its US duty, and a listing draft. Nothing lists until a person confirms the category."
          : "Every product has a suggestion. Run one again from its own page."}
      </p>
      {rows && (
        <div className="relative mt-4">
          <div className="mb-2 flex justify-between text-[12px] text-muted">
            <span>{running ? "Working through the sheet, one product per request" : `Done: ${done} of ${rows.length}`}</span>
            <span className="num">{done} / {rows.length}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-rule">
            <motion.div className="h-full rounded-full bg-indigo" animate={{ width: `${(rows.filter((r) => r.state === "done" || r.state === "failed").length / rows.length) * 100}%` }} />
          </div>
          <ul className="mt-3 divide-y divide-rule" aria-live="polite">
            {rows.map((r) => (
              <li key={r.id} className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-3 py-2.5">
                <span className="grid place-items-center">
                  {r.state === "working" ? <LoaderCircle size={15} className="animate-spin text-indigo" />
                    : r.state === "done" ? <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}><Check size={15} strokeWidth={2.5} className="text-positive" /></motion.span>
                    : r.state === "failed" ? <X size={15} className="text-negative" />
                    : <span className="size-1.5 rounded-full bg-control" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] text-ink">{r.name}</span>
                  {r.state === "working" && <span className="thinking block text-[12px]">Reading material and use…</span>}
                  {r.state === "failed" && <span className="block truncate text-[12px] text-negative">{r.error}</span>}
                  {r.state === "done" && (
                    <motion.span initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="block text-[12px] text-ink-2">
                      {r.category} · HS {r.hs} · {pct(r.confidence ?? 0, 0)} sure
                    </motion.span>
                  )}
                </span>
                <span className="num text-[12px] text-muted">{r.ms ? seconds(r.ms) : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="relative mt-4 flex flex-wrap gap-2">
        <Button kind="primary" onClick={run} disabled={!todo.length || running}>{running ? "Classifying…" : todo.length ? `Classify ${todo.length} products` : "Nothing to classify"}</Button>
        {rows && !running && <Link to="/"><Button>See the catalogue</Button></Link>}
      </div>
    </section>
  );
}

export default function ImportPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [replaceAll, setReplaceAll] = useState(true);
  const [drag, setDrag] = useState(false);
  const upload = useMutation({ mutationFn: (f: File) => api.importFile(f, replaceAll), onSuccess: () => qc.invalidateQueries() });
  const sample = useMutation({ mutationFn: api.sample, onSuccess: () => qc.invalidateQueries() });
  const result = upload.data ?? sample.data;
  const error = upload.error ?? sample.error;

  return (
    <div className="max-w-[1180px]">
      <PageTitle title="Import" sub="Bring in a supplier sheet. Tradelane prices every product on every marketplace it can ship to." />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card title="Supplier sheet" aside={<a className="text-indigo hover:underline" href="/api/template.csv">Download the template</a>}>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) upload.mutate(f); }}
              className={`flex w-full flex-col items-center justify-center gap-2 rounded-card border border-dashed px-6 py-10 text-center transition-colors ${drag ? "border-indigo bg-indigo-pale" : "border-control bg-ground hover:bg-raised"}`}
            >
              <FileSpreadsheet size={22} strokeWidth={1.5} className="text-muted" aria-hidden />
              <span className="text-[14px] text-ink">{upload.isPending ? "Reading the sheet…" : "Drop a .csv or .xlsx file, or choose one"}</span>
              <span className="text-[12px] text-muted">Up to 4 MB. The first row is the header.</span>
            </button>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xlsm" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ""; }} />
            <label className="mt-3 flex items-center gap-2 text-[13px] text-ink-2">
              <input type="checkbox" checked={replaceAll} onChange={(e) => setReplaceAll(e.target.checked)} className="size-4 accent-indigo" />
              Replace the current catalogue and its decisions
            </label>
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-rule pt-4">
              <Button onClick={() => sample.mutate()} disabled={sample.isPending}>{sample.isPending ? "Loading…" : "Load the 30-product sample"}</Button>
              <span className="text-[12px] text-muted">Indian and UK suppliers; replaces the catalogue.</span>
            </div>
            {result && (
              <div className="mt-4 space-y-2">
                <p className="text-[14px] text-ink">Imported {result.imported} products. <Link className="text-indigo" to="/">Open the catalogue</Link>.</p>
                {result.errors.length > 0 && (
                  <Notice>
                    {result.errors.length} rows skipped:
                    <ul className="mt-1 list-disc pl-5">{result.errors.slice(0, 6).map((e) => <li key={e}>{e}</li>)}</ul>
                  </Notice>
                )}
              </div>
            )}
            {error && <div className="mt-4"><Notice tone="error">{(error as Error).message}</Notice></div>}
          </Card>
          <ClassifyAll />
        </div>
        <Card title="Columns" aside="Case does not matter" pad={false}>
          <table className="w-full text-[13px]">
            <tbody>
              {COLUMNS.map(([c, need, what]) => (
                <tr key={c} className="border-t border-rule first:border-t-0 align-top">
                  <td className="py-2.5 pr-3 pl-5 font-medium text-ink">{c}</td>
                  <td className="py-2.5 pr-3 whitespace-nowrap text-muted">{need}</td>
                  <td className="py-2.5 pr-5 text-ink-2">{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
