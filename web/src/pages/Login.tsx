import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { ArrowRight, BadgeCheck, Database, Sparkles } from "lucide-react";
import { api } from "../api";
import { Avatar } from "../components/Avatar";
import { Mesh } from "../components/Mesh";
import { Mark } from "../components/Shell";
import { ThemeSwitch } from "../components/Theme";

const CAN: Record<string, string[]> = {
  buyer: ["Imports supplier sheets", "Runs the AI classification", "Sets prices and asks the analyst"],
  approver: ["Everything Asha can do", "Approves or rejects each lane", "Exports what is ready to list"],
};

export default function Login() {
  const qc = useQueryClient();
  const { data: users, isLoading, isError } = useQuery({ queryKey: ["users"], queryFn: api.users });
  const login = useMutation({ mutationFn: api.login, onSuccess: (u) => { qc.setQueryData(["me"], u); qc.invalidateQueries(); } });

  return (
    <div className="relative min-h-dvh overflow-hidden bg-surface">
      <Mesh className="h-[520px]" />
      <div className="relative mx-auto flex min-h-dvh max-w-[1180px] flex-col px-5 py-6 sm:px-8">
        <header className="flex items-center gap-2">
          <Mark />
          <span className="text-[16px] font-semibold tracking-tight">Tradelane</span>
          <span className="ml-auto w-[230px]"><ThemeSwitch /></span>
        </header>

        <div className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[1.1fr_1fr]">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>
            <h1 className="display max-w-[14ch] text-[44px] text-ink sm:text-[60px]">Know where every product makes money.</h1>
            <p className="mt-6 max-w-[52ch] text-[17px] leading-7 text-ink-2">
              Landed cost for each supplier product on Amazon UK, Amazon US and Walmart US: shipping, duty, tariffs, VAT, fees and FX.
              AI does the repetitive work. A person makes the call.
            </p>
            <ul className="mt-8 space-y-2.5 text-[14px] text-ink-2">
              <li className="flex items-center gap-2.5"><Sparkles size={16} className="text-indigo" /> AI classifies products and answers questions about the catalogue</li>
              <li className="flex items-center gap-2.5"><Database size={16} className="text-indigo" /> Every product, price and decision is saved with who made it</li>
              <li className="flex items-center gap-2.5"><BadgeCheck size={16} className="text-indigo" /> Fees and tariffs checked against official sources on 22 Oct 2026</li>
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-panel border border-border bg-surface/95 p-6 shadow-[0_24px_60px_rgb(0_55_112/0.12)] backdrop-blur"
          >
            <h2 className="text-[20px] font-semibold">Try the demo</h2>
            <p className="mt-1 text-[14px] text-ink-2">Pick a person. What you do is saved under their name and shows up in the team's activity.</p>
            <div className="mt-5 space-y-3">
              {isLoading && [0, 1].map((i) => <div key={i} className="h-[108px] rounded-card bg-raised" />)}
              {isError && <p className="rounded-control bg-negative-pale px-3 py-2 text-[13px] text-negative-ink">Couldn't reach the server. Is the API running?</p>}
              {users?.map((u) => (
                <button
                  key={u.id}
                  onClick={() => login.mutate(u.id)}
                  disabled={login.isPending}
                  className="group flex w-full items-start gap-4 rounded-card border border-border p-4 text-left transition-all hover:-translate-y-0.5 hover:border-indigo hover:shadow-[0_10px_30px_rgb(83_58_253/0.12)]"
                >
                  <Avatar user={u} size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-[16px] font-semibold text-ink">Continue as {u.name.split(" ")[0]}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${u.role === "approver" ? "bg-approver-pale text-approver-ink" : "bg-indigo-pale text-indigo-press"}`}>{u.role}</span>
                    </span>
                    <span className="mt-0.5 block text-[13px] text-muted">{u.title}</span>
                    <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-2">
                      {CAN[u.role].map((c) => <span key={c}>· {c}</span>)}
                    </span>
                  </span>
                  <ArrowRight size={18} className="mt-1 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-indigo" />
                </button>
              ))}
            </div>
            {login.isError && <p className="mt-3 text-[13px] text-negative">{(login.error as Error).message}</p>}
          </motion.div>
        </div>
        <p className="text-[12px] text-muted">A demo built for Babaclick. Sample products; real fee schedules, tariffs and exchange rates.</p>
      </div>
    </div>
  );
}
