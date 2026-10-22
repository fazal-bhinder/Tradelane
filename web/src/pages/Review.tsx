import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Lock } from "lucide-react";
import { api, CHANNELS, type Lane, type Product, type User } from "../api";
import { useToast } from "../components/Toast";
import { Waterfall } from "../components/charts";
import { PageTitle } from "../components/Shell";
import { Bar, Button, Card, Notice, VerdictPill, inputCls } from "../components/ui";
import { money, pct } from "../format";

type Item = { p: Product; lane: Lane };
const RANK = { list: 0, check: 1, skip: 2, "needs-data": 3 } as const;
const channelName = (id: string) => CHANNELS.find((c) => c.id === id)?.name ?? id;

function Detail({ item, onDecided, me }: { item: Item; onDecided: () => void; me: User }) {
  const qc = useQueryClient();
  const toast = useToast();
  const approver = me.role === "approver";
  const [note, setNote] = useState("");
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const { data: full } = useQuery({ queryKey: ["product", item.p.id], queryFn: () => api.product(item.p.id) });
  const lane = full?.lanes.find((l) => l.channel === item.lane.channel);
  const decide = useMutation({
    mutationFn: (decision: "approved" | "rejected") => api.review({ product_id: item.p.id, channel: item.lane.channel, decision, note }),
    onSuccess: async (_, decision) => {
      setNote("");
      toast(`${decision === "approved" ? "Approved" : "Rejected"} ${item.p.name} on ${channelName(item.lane.channel)}`);
      await qc.invalidateQueries();
      onDecided();
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  useEffect(() => setNote(""), [item.p.id, item.lane.channel]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!approver || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || decide.isPending) return;
      if (e.key === "a") decide.mutate("approved");
      if (e.key === "r") decide.mutate("rejected");
      if (e.key === "n") { e.preventDefault(); noteRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide, approver]);

  const l = item.lane;
  return (
    <Card
      className="lg:self-start"
      title={<span>{item.p.name} <span className="font-normal text-muted">on {channelName(l.channel)}</span></span>}
      aside={<Link className="text-indigo" to={`/products/${item.p.id}?lane=${l.channel}`}>Open product</Link>}
    >
      <div className="mb-4 flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <p className="text-[13px] text-muted">Net margin</p>
          <p className={`figure text-[32px] leading-10 ${l.margin != null && l.margin < 0 ? "text-negative" : ""}`}>{pct(l.margin, 1)}</p>
        </div>
        <div>
          <p className="text-[13px] text-muted">Profit a sale</p>
          <p className="figure text-[24px] leading-8">{money(l.profit, l.currency, { sign: true })}</p>
        </div>
        <div>
          <p className="text-[13px] text-muted">Target price</p>
          <p className="figure text-[24px] leading-8">{money(l.target_price, l.currency)}</p>
        </div>
        <div className="ml-auto"><VerdictPill verdict={l.verdict} /></div>
      </div>
      {l.reasons.length > 0 && <p className="mb-3 text-[13px] text-ink-2">{l.reasons.join(". ")}.</p>}
      {lane?.lines && lane.price != null && lane.profit != null ? (
        <Waterfall price={lane.price} profit={lane.profit} lines={lane.lines} currency={lane.currency} />
      ) : l.price == null ? (
        <p className="text-[13px] text-ink-2">No market price yet: it needs {money(l.target_price, l.currency)} to make the target, {money(l.break_even, l.currency)} to break even.</p>
      ) : (
        <div aria-busy="true">{[0, 1, 2, 3, 4, 5].map((i) => <Bar key={i} className="mb-3 block h-5 w-full" />)}</div>
      )}
      {!approver ? (
        <p className="mt-5 flex items-start gap-2 rounded-control bg-ground px-3 py-2.5 text-[13px] text-ink-2">
          <Lock size={14} className="mt-0.5 shrink-0 text-muted" />
          You can see the queue as a buyer; Rohan decides. Switch to him in the sidebar to approve or reject.
        </p>
      ) : (
      <div className="mt-5 border-t border-rule pt-4">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Note <span className="font-normal text-muted">(N)</span></span>
          <textarea ref={noteRef} rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className={`${inputCls} h-auto w-full py-2`} placeholder="Why, in a line (optional)" />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button kind="primary" onClick={() => decide.mutate("approved")} disabled={decide.isPending}>Approve to list <kbd className="ml-1 text-[11px] opacity-70">A</kbd></Button>
          <Button onClick={() => decide.mutate("rejected")} disabled={decide.isPending}>Reject <kbd className="ml-1 text-[11px] text-muted">R</kbd></Button>
          <span className="ml-auto hidden text-[12px] text-muted sm:inline">J and K move through the queue</span>
        </div>
        {decide.isError && <div className="mt-3"><Notice tone="error">{(decide.error as Error).message}</Notice></div>}
      </div>
      )}
    </Card>
  );
}

export default function ReviewPage({ me }: { me: User }) {
  const { data, isLoading, isError, error } = useQuery({ queryKey: ["catalogue"], queryFn: api.catalogue });
  const [selected, setSelected] = useState<string | null>(null);

  const queue: Item[] = useMemo(() => {
    if (!data) return [];
    return data.products
      .flatMap((p) => p.lanes.filter((l) => !l.review && l.verdict !== "needs-data").map((lane) => ({ p, lane })))
      .sort((a, b) => RANK[a.lane.verdict] - RANK[b.lane.verdict] || (b.lane.margin ?? -9) - (a.lane.margin ?? -9));
  }, [data]);
  const key = (i: Item) => `${i.p.id}:${i.lane.channel}`;
  const index = Math.max(0, queue.findIndex((i) => key(i) === selected));
  const current = queue[index];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); setSelected(queue[Math.min(queue.length - 1, index + 1)] ? key(queue[Math.min(queue.length - 1, index + 1)]) : null); }
      if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); setSelected(queue[Math.max(0, index - 1)] ? key(queue[Math.max(0, index - 1)]) : null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [queue, index]);

  if (isLoading) return <div aria-busy="true"><Bar className="h-7 w-40" /><Bar className="mt-6 block h-96 w-full" /></div>;
  if (isError || !data) return <Notice tone="error">Couldn't load the queue: {(error as Error)?.message}</Notice>;

  const lanes = data.products.flatMap((p) => p.lanes);
  const approvedBy = (c: string) => lanes.filter((l) => l.channel === c && l.review?.decision === "approved").length;
  const needsData = lanes.filter((l) => l.verdict === "needs-data" && !l.review).length;

  return (
    <>
      <PageTitle
        title="Review"
        sub={queue.length ? `${queue.length} lanes waiting for ${me.role === "approver" ? "your" : "Rohan's"} decision. The ones worth listing come first.` : "Nothing waiting. Approved lanes are ready to export."}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <section className="rounded-card border border-border bg-surface">
            <header className="flex items-center justify-between px-4 pt-3.5 pb-2">
              <h2 className="text-[15px] font-semibold">Waiting</h2>
              <span className="num text-[13px] text-muted">{queue.length}</span>
            </header>
            {queue.length ? (
              <ul className="max-h-[560px] overflow-y-auto pb-1.5" aria-label="Lanes waiting">
                <AnimatePresence initial={false}>
                {queue.map((i) => {
                  const on = current && key(i) === key(current);
                  return (
                    <motion.li key={key(i)} layout exit={{ opacity: 0, x: 40, height: 0 }} transition={{ duration: 0.3 }}>
                      <button
                        onClick={() => setSelected(key(i))}
                        aria-current={on}
                        className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2.5 text-left transition-colors ${on ? "bg-active" : "hover:bg-ground"}`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] text-ink">{i.p.name}</span>
                          <span className="block text-[12px] text-muted">{channelName(i.lane.channel)}</span>
                        </span>
                        <span className="flex flex-col items-end gap-1">
                          <span className={`num text-[14px] ${i.lane.margin != null && i.lane.margin < 0 ? "text-negative" : "text-ink"}`}>{i.lane.price == null ? "No price" : pct(i.lane.margin, 1)}</span>
                          <VerdictPill verdict={i.lane.verdict} />
                        </span>
                      </button>
                    </motion.li>
                  );
                })}
                </AnimatePresence>
              </ul>
            ) : (
              <p className="mx-4 mb-4 rounded-control border border-dashed border-control px-3 py-3 text-[13px] text-muted">Every priced lane has a decision.</p>
            )}
            {needsData > 0 && (
              <p className="border-t border-rule px-4 py-2.5 text-[12px] text-muted">{needsData} lanes need data first. <Link className="text-indigo" to="/">Find them in the catalogue</Link>.</p>
            )}
          </section>
          <Card title="Ready to export" aside="Approved lanes as CSV">
            <ul className="space-y-2">
              {CHANNELS.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 text-[14px]">
                  <span>{c.name} <span className="num text-muted">{approvedBy(c.id)}</span></span>
                  {approvedBy(c.id) ? (
                    <a href={`/api/export.csv?channel=${c.id}`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-indigo hover:underline">
                      <Download size={14} strokeWidth={1.6} /> Download
                    </a>
                  ) : (
                    <span className="text-[13px] text-muted">None yet</span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
        {current ? (
          <Detail me={me} item={current} onDecided={() => setSelected(queue[index + 1] ? key(queue[index + 1]) : null)} />
        ) : (
          <Card title="All caught up">
            <p className="text-ink-2">Every priced lane has a decision; approved ones are ready to download. <Link className="text-indigo" to="/">Back to the catalogue</Link>.</p>
          </Card>
        )}
      </div>
    </>
  );
}
