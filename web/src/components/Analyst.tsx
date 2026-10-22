import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Check, Database, FlaskConical, LoaderCircle, Package, Search, Sparkles, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, ask, type AskEvent, type AskStep } from "../api";
import { ago, seconds } from "../format";
import { Avatar, firstName } from "./Avatar";

type Open = (opts?: { question?: string; sku?: string; productName?: string }) => void;
const Ctx = createContext<Open>(() => {});
export const useAnalyst = () => useContext(Ctx);

const TOOL_ICON: Record<string, typeof Search> = {
  catalogue_overview: Database,
  find_lanes: Search,
  product_detail: Package,
  what_if: FlaskConical,
};

const GENERAL = [
  "Which products lose money on Walmart US, and what would fix the worst one?",
  "Where should I list the jewellery: Amazon UK, Amazon US or Walmart US?",
  "If my carrier gets 20% cheaper from India, which lanes start making money?",
  "What should Rohan approve first today?",
];

const forProduct = (name: string) => [
  `Is ${name} worth listing anywhere? Which marketplace is best?`,
  `What price makes ${name} hit the target margin on each marketplace?`,
  `What is eating the margin on ${name}?`,
];

/** Bold and bullets, nothing more: the analyst is told to write plainly. */
function Rich({ text }: { text: string }) {
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") ? <strong key={i} className="font-semibold text-ink">{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>,
    );
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) blocks.push(<ul key={blocks.length} className="my-2 space-y-1.5 pl-1">{bullets.map((b, i) => (
      <li key={i} className="flex gap-2"><span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-indigo" /><span>{inline(b)}</span></li>
    ))}</ul>);
    bullets = [];
  };
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (/^[-•*]\s+/.test(t)) bullets.push(t.replace(/^[-•*]\s+/, ""));
    else {
      flush();
      if (t) blocks.push(<p key={blocks.length} className="my-2">{inline(t)}</p>);
    }
  }
  flush();
  return <div className="text-[14px] leading-[22px] text-ink-2">{blocks}</div>;
}

function Steps({ steps, live }: { steps: AskStep[]; live?: boolean }) {
  return (
    <ol className="space-y-1.5">
      <AnimatePresence initial={false}>
        {steps.map((s, i) => {
          const Icon = TOOL_ICON[s.tool] ?? Search;
          return (
            <motion.li
              key={`${i}-${s.label}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2.5 rounded-control bg-ground px-2.5 py-1.5 text-[13px]"
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface text-indigo ring-1 ring-border">
                <Icon size={13} strokeWidth={1.8} />
              </span>
              <span className={`min-w-0 flex-1 truncate ${s.status === "running" ? "thinking" : "text-ink-2"}`}>{s.label}</span>
              {s.status === "running" ? (
                <LoaderCircle size={14} className="shrink-0 animate-spin text-muted" />
              ) : (
                <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted">
                  {s.summary}
                  <Check size={13} strokeWidth={2.5} className="text-positive" />
                </span>
              )}
            </motion.li>
          );
        })}
      </AnimatePresence>
      {live && !steps.some((s) => s.status === "running") && (
        <li className="flex items-center gap-2.5 px-2.5 py-1.5 text-[13px]">
          <Sparkles size={14} className="text-indigo" />
          <span className="thinking">{steps.length ? "Writing the answer" : "Thinking about where to look"}</span>
        </li>
      )}
    </ol>
  );
}

type Turn = { question: string; steps: AskStep[]; answer?: string; ms?: number; error?: string; done: boolean; user?: string };

function Drawer({ onClose, seed }: { onClose: () => void; seed: { question?: string; sku?: string; productName?: string } }) {
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: api.me });
  const { data: history } = useQuery({ queryKey: ["asks"], queryFn: api.asks });
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const busy = turns.some((t) => !t.done);

  const send = useCallback(async (question: string) => {
    if (!question.trim() || busy) return;
    setText("");
    abort.current = new AbortController();
    setTurns((ts) => [...ts, { question, steps: [], done: false }]);
    const update = (fn: (t: Turn) => Turn) => setTurns((ts) => ts.map((t, i) => (i === ts.length - 1 ? fn(t) : t)));
    try {
      await ask(question, seed.sku, (e: AskEvent) => {
        if (e.type === "step") {
          update((t) => {
            const steps = [...t.steps];
            const at = steps.findIndex((s) => s.status === "running" && s.label === e.label);
            if (e.status === "done" && at >= 0) steps[at] = e;
            else steps.push(e);
            return { ...t, steps };
          });
        } else if (e.type === "answer") update((t) => ({ ...t, answer: e.text, ms: e.ms }));
        else update((t) => ({ ...t, error: e.message }));
      }, abort.current.signal);
    } catch (err) {
      if ((err as Error).name !== "AbortError") update((t) => ({ ...t, error: (err as Error).message }));
    }
    update((t) => ({ ...t, done: true }));
    qc.invalidateQueries({ queryKey: ["asks"] });
    qc.invalidateQueries({ queryKey: ["activity"] });
  }, [busy, qc, seed.sku]);

  useEffect(() => {
    if (seed.question) send(seed.question);
    // seed only once per opening
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    // braces matter: newer browsers return a Promise from scrollIntoView, and an effect may only return a cleanup
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);
  useEffect(() => () => abort.current?.abort(), []);

  const suggestions = seed.productName ? forProduct(seed.productName) : GENERAL;

  return (
    <motion.aside
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 340, damping: 36 }}
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col border-l border-border bg-surface shadow-[-24px_0_60px_rgb(13_37_61/0.14)]"
      role="dialog"
      aria-label="Ask Tradelane"
    >
      <header className="relative overflow-hidden border-b border-border px-5 py-4">
        <div className="pointer-events-none absolute -top-16 -right-10 h-40 w-64 rounded-full bg-mesh-lavender opacity-60 blur-3xl dark:hidden" />
        <div className="pointer-events-none absolute -top-20 right-28 h-36 w-48 rounded-full bg-mesh-orange opacity-40 blur-3xl dark:hidden" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-[17px] font-semibold"><Sparkles size={17} className="text-indigo" /> Ask Tradelane</h2>
            <p className="mt-0.5 text-[12px] text-ink-2">
              Answers from your own catalogue, worked through the same margin engine as every screen.
            </p>
            {seed.productName && <p className="mt-1.5 inline-flex rounded-full bg-indigo-pale px-2 py-0.5 text-[12px] text-indigo-press">Looking at {seed.productName}</p>}
          </div>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-full text-muted hover:bg-raised" aria-label="Close">
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {!turns.length && (
          <>
            <div>
              <p className="mb-2 text-[12px] font-medium text-muted">Try asking</p>
              <div className="flex flex-col gap-2">
                {suggestions.map((q) => (
                  <button key={q} onClick={() => send(q)} className="rounded-card border border-border px-3 py-2.5 text-left text-[13px] text-ink-2 transition-colors hover:border-indigo hover:bg-indigo-pale/40 hover:text-ink">
                    {q}
                  </button>
                ))}
              </div>
            </div>
            {!!history?.length && (
              <div>
                <p className="mb-2 text-[12px] font-medium text-muted">Asked by the team</p>
                <ul className="space-y-1">
                  {history.slice(0, 6).map((h) => (
                    <li key={h.id}>
                      <button
                        onClick={() => setTurns([{ question: h.question, steps: h.steps, answer: h.answer, ms: h.ms, done: true, user: h.user }])}
                        className="flex w-full items-start gap-2.5 rounded-control px-2 py-2 text-left hover:bg-ground"
                      >
                        <Avatar id={h.user} size={22} />
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 text-[13px] text-ink">{h.question}</span>
                          <span className="text-[12px] text-muted">{firstName(h.user)} · {ago(h.at)} · {h.steps.length} {h.steps.length === 1 ? "step" : "steps"} · {seconds(h.ms)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {turns.map((t, i) => (
          <div key={i} className="space-y-3">
            <div className="flex items-start gap-2.5">
              <Avatar id={t.user ?? me?.id} size={26} />
              <p className="rounded-card rounded-tl-sm bg-ground px-3 py-2 text-[14px] text-ink">{t.question}</p>
            </div>
            <div className="ml-9 space-y-3">
              <Steps steps={t.steps} live={!t.done && !t.answer} />
              {t.answer && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-card border border-border bg-surface px-4 py-2 shadow-[0_1px_3px_rgb(0_55_112/0.08)]">
                  <Rich text={t.answer} />
                  <p className="mb-1 flex flex-wrap gap-x-2 border-t border-rule pt-2 text-[12px] text-muted">
                    <span>{t.steps.length} {t.steps.length === 1 ? "tool call" : "tool calls"}</span>
                    {t.ms != null && <span>· {seconds(t.ms)}</span>}
                    <span>· saved to the team history</span>
                  </p>
                </motion.div>
              )}
              {t.error && <p className="rounded-control bg-negative-pale px-3 py-2 text-[13px] text-negative-ink">{t.error}</p>}
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(text); }}
        className="border-t border-border bg-surface p-3"
      >
        <div className="flex items-end gap-2 rounded-card border border-control bg-surface p-1.5 focus-within:border-indigo focus-within:ring-2 focus-within:ring-indigo/15">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
            rows={1}
            placeholder={busy ? "Working on it…" : "Ask about margins, prices, marketplaces…"}
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-[14px] outline-none placeholder:text-muted"
            disabled={busy}
            aria-label="Question"
          />
          <button type="submit" disabled={busy || !text.trim()} className="grid size-9 shrink-0 place-items-center rounded-full bg-indigo text-on-accent transition-colors hover:bg-indigo-deep disabled:bg-control" aria-label="Ask">
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : <ArrowUp size={17} strokeWidth={2.2} />}
          </button>
        </div>
        <p className="mt-1.5 px-1 text-[11px] text-muted">It reads the catalogue and runs what-ifs; it never changes your data.</p>
      </form>
    </motion.aside>
  );
}

export function AnalystProvider({ children }: { children: ReactNode }) {
  const [seed, setSeed] = useState<{ question?: string; sku?: string; productName?: string } | null>(null);
  const [key, setKey] = useState(0);
  const open: Open = useCallback((opts = {}) => { setSeed(opts); setKey((k) => k + 1); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); open(); }
      if (e.key === "Escape") setSeed(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <Ctx.Provider value={open}>
      {children}
      <AnimatePresence>
        {seed && (
          <>
            <motion.div key="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSeed(null)} className="fixed inset-0 z-40 bg-navy/20" />
            <Drawer key={key} seed={seed} onClose={() => setSeed(null)} />
          </>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}
