import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { api } from "../api";
import { ActivityFeed } from "../components/ActivityFeed";
import { useAnalyst } from "../components/Analyst";
import { Avatar, firstName } from "../components/Avatar";
import { PageTitle } from "../components/Shell";
import { Card } from "../components/ui";
import { ago, seconds } from "../format";

export default function ActivityPage() {
  const analyst = useAnalyst();
  const { data: asks } = useQuery({ queryKey: ["asks"], queryFn: api.asks });
  return (
    <>
      <PageTitle title="Activity" sub="Everything the team and the AI have done, newest first. Each line is saved with who did it and when." />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card title="Changes and decisions" aside="Refreshes every 8 seconds">
          <ActivityFeed limit={100} />
        </Card>
        <Card title="Questions asked" aside={<button className="inline-flex items-center gap-1 text-indigo hover:underline" onClick={() => analyst()}><Sparkles size={13} /> Ask one</button>}>
          {!asks?.length ? (
            <p className="text-[13px] text-muted">No questions yet. The analyst's answers and the steps it took are saved here for the whole team.</p>
          ) : (
            <ul className="space-y-4">
              {asks.map((a) => (
                <li key={a.id} className="flex gap-3">
                  <Avatar id={a.user} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] text-ink">{a.question}</p>
                    <p className="mt-1 line-clamp-3 text-[13px] text-ink-2">{a.answer.replace(/\*\*/g, "")}</p>
                    <p className="mt-1 text-[12px] text-muted">{firstName(a.user)} · {ago(a.at)} · {a.steps.length} {a.steps.length === 1 ? "tool call" : "tool calls"} · {seconds(a.ms)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
