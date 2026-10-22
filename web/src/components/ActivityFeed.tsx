import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Link } from "react-router-dom";
import { api, CHANNELS, type Activity } from "../api";
import { ago } from "../format";
import { Avatar, firstName } from "./Avatar";

const DOT: Record<string, string> = {
  review: "bg-indigo", classify: "bg-magenta", brief: "bg-magenta", ask: "bg-magenta",
  price: "bg-mesh-orange", rule: "bg-mesh-orange", import: "bg-positive", category: "bg-positive", hs: "bg-positive",
};

function sentence(a: Activity) {
  const msg = a.product ? a.message.replace(/\bit\b/, a.product) : a.message;
  return msg;
}

export function ActivityFeed({ limit = 12, productId, compact = false }: { limit?: number; productId?: number; compact?: boolean }) {
  const { data, isLoading } = useQuery({ queryKey: ["activity", limit], queryFn: () => api.activity(limit), refetchInterval: 8000 });
  const rows = (data ?? []).filter((a) => productId == null || a.product_id === productId);
  if (isLoading) return <div className="space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-10 rounded-control bg-raised" />)}</div>;
  if (!rows.length) return <p className="text-[13px] text-muted">Nothing yet. Every change anyone makes shows up here, with who made it.</p>;
  return (
    <ol className="relative space-y-0.5">
      <AnimatePresence initial={false}>
        {rows.map((a) => (
          <motion.li
            key={a.id}
            layout
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="flex gap-3 rounded-control px-2 py-2"
          >
            <span className="relative mt-0.5 inline-flex h-fit shrink-0">
              <Avatar id={a.user} size={26} />
              <span className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-surface ${DOT[a.kind] ?? "bg-control"}`} />
            </span>
            <div className="min-w-0 flex-1 text-[13px] leading-[18px]">
              <p className="text-ink-2">
                <span className="font-medium text-ink">{firstName(a.user)}</span> {compact ? a.message : sentence(a)}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-muted">
                <span>{ago(a.at)}</span>
                {a.channel && <span>· {CHANNELS.find((c) => c.id === a.channel)?.name}</span>}
                {a.product_id && !compact && (
                  <Link to={`/products/${a.product_id}`} className="truncate text-indigo hover:underline">· open</Link>
                )}
              </p>
            </div>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  );
}
