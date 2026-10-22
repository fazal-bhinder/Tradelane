import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { api, type Rules, type Tier } from "../api";
import { PageTitle } from "../components/Shell";
import { Bar, Button, Notice, SourceTag, inputCls } from "../components/ui";
import { money, num, pct } from "../format";

function Section({ title, about, children }: { title: string; about: ReactNode; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-border py-8 first:border-t-0 first:pt-0 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-10">
      <div>
        <h2 className="text-[16px] font-medium text-ink">{title}</h2>
        <div className="mt-1 text-[14px] text-ink-2">{about}</div>
      </div>
      <div className="min-w-0 rounded-card border border-border bg-surface p-4 sm:p-5">{children}</div>
    </section>
  );
}

function useRule() {
  const qc = useQueryClient();
  const onSuccess = () => qc.invalidateQueries();
  return {
    set: useMutation({ mutationFn: ({ key, value }: { key: string; value: number }) => api.setRule(key, value), onSuccess }),
    reset: useMutation({ mutationFn: (key: string) => api.resetRule(key), onSuccess }),
  };
}

/** Commits on Enter or blur; percentages are typed as 20 and stored as 0.2. */
function NumberInput({ value, scale = 1, onCommit, label, suffix }: { value: number; scale?: number; onCommit: (v: number) => void; label: string; suffix: string }) {
  const shown = +(value * scale).toFixed(2);
  const [text, setText] = useState(String(shown));
  useEffect(() => setText(String(shown)), [shown]);
  const commit = () => {
    const v = Number(text);
    if (text.trim() === "" || Number.isNaN(v) || v < 0) return setText(String(shown));
    if (v !== shown) onCommit(v / scale);
  };
  return (
    <span className="relative inline-block w-28">
      <input
        aria-label={label}
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        className={`${inputCls} w-full text-right ${suffix.length > 1 ? "pr-12" : "pr-8"}`}
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[13px] text-muted">{suffix}</span>
    </span>
  );
}

function feeText(tiers: Tier[], whole: boolean, cur: string): string {
  if (tiers.length === 1) return pct(tiers[0].pct, 0);
  const sym = cur === "GBP" ? "£" : "$";
  if (whole) return tiers.map((t, i) => (t.upto != null ? `${pct(t.pct, 0)} to ${sym}${t.upto}` : `${pct(t.pct, 0)} above ${sym}${tiers[i - 1].upto}`)).join(", ");
  return tiers.map((t, i) => (t.upto != null ? `${pct(t.pct, 0)} of the first ${sym}${t.upto}` : `${pct(t.pct, 0)} above ${sym}${tiers[i - 1].upto}`)).join(", ");
}

function Content({ r }: { r: Rules }) {
  const { set, reset } = useRule();
  const err = set.error || reset.error;
  const us = r.duties.US;
  const uk = r.duties.GB;
  return (
    <>
      {err && <div className="mb-4"><Notice tone="error">{(err as Error).message}</Notice></div>}
      <Section title="Margins and allowances" about="Your own numbers. They apply to every product and every marketplace.">
        <ul className="divide-y divide-rule">
          {r.assumptions.map((a) => (
            <li key={a.key} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div>
                <p className="text-[14px] text-ink">{a.label}</p>
                <p className="text-[12px] text-muted">{a.edited ? `Default ${pct(a.default, 1)}` : "Default"}</p>
              </div>
              <div className="flex items-center gap-2">
                {a.edited && <Button kind="ghost" className="h-7 px-3 text-[13px]" onClick={() => reset.mutate(a.key)}>Reset</Button>}
                <NumberInput label={a.label} value={a.value} scale={100} suffix="%" onCommit={(v) => set.mutate({ key: a.key, value: v })} />
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Shipping rates" about={<>A sample parcel rate card per route, priced as a base fee plus a rate per chargeable kilo (the greater of actual weight and length × width × height ÷ 5,000). Replace it with your carrier contract.</>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-[14px]">
            <thead>
              <tr className="text-[12px] text-muted">
                <th className="pb-2 text-left font-normal">Route</th>
                <th className="pb-2 text-right font-normal">Per parcel</th>
                <th className="pb-2 text-right font-normal">Per kg</th>
                <th className="pb-2 text-right font-normal">Transit</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {r.routes.map((rt) => {
                const k = `route:${rt.origin}-${rt.dest}`;
                return (
                  <tr key={k} className="border-t border-rule">
                    <td className="py-2.5">{r.origins[rt.origin]} to {rt.dest === "GB" ? "UK" : "US"}</td>
                    <td className="py-2.5 text-right"><NumberInput label={`${k} base`} value={rt.base} suffix={rt.currency} onCommit={(v) => set.mutate({ key: `${k}:base`, value: v })} /></td>
                    <td className="py-2.5 pl-2 text-right"><NumberInput label={`${k} per kg`} value={rt.per_kg} suffix={rt.currency} onCommit={(v) => set.mutate({ key: `${k}:per_kg`, value: v })} /></td>
                    <td className="num py-2.5 text-right text-ink-2">{rt.transit_days[0]}–{rt.transit_days[1]} days</td>
                    <td className="py-2.5 pl-3 text-right"><SourceTag source={rt.source} compact /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Marketplace fees" about={<>Referral fees per category for merchant-fulfilled orders, as published. Checked {r.checked}. Amazon UK's pages disagree on whether the fee is charged on the price with VAT; Tradelane uses the higher reading.</>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="text-[12px] text-muted">
                <th className="pb-2 text-left font-normal">Category</th>
                {r.channels.map((c) => (
                  <th key={c.id} className="pb-2 pl-3 text-left font-normal">
                    <span className="inline-flex items-center gap-1.5">{c.name} <SourceTag source={c.fees.home.source} compact /></span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(r.categories).map(([k, name]) => (
                <tr key={k} className="border-t border-rule align-top">
                  <td className="py-2 pr-3 text-ink">{name}</td>
                  {r.channels.map((c) => {
                    const f = c.fees[k];
                    return <td key={c.id} className="py-2 pl-3 text-ink-2">{f ? feeText(f.tiers, f.whole_price, c.currency) : "—"}</td>;
                  })}
                </tr>
              ))}
              <tr className="border-t border-rule">
                <td className="py-2 pr-3 text-muted">Minimum per item</td>
                {r.channels.map((c) => <td key={c.id} className="num py-2 pl-3 text-ink-2">{c.fees.home.min_fee ? money(c.fees.home.min_fee, c.currency) : "None"}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Import duty and tax" about="Duty is worked out per parcel. A product's own HS code replaces the category's typical rate when the US tariff schedule has one.">
        <div className="grid gap-6 xl:grid-cols-2">
          <div>
            <h3 className="mb-2 text-[14px] font-medium">United States</h3>
            <ul className="mb-3 space-y-1.5 text-[13px] text-ink-2">
              <li className="flex items-start gap-2"><SourceTag source={us.extra_source} compact /><span>Section 301 tariff of {pct(us.extra_by_origin.IN, 0)} on goods from India and the UK, on top of the normal rate, since 24 Jul 2026.</span></li>
              <li className="flex items-start gap-2"><SourceTag source={{ kind: "fact", label: "De minimis suspended for all countries", url: "https://www.federalregister.gov/documents/2026/06/24/2026-12669/indefinite-suspension-of-the-de-minimis-exemption-for-mail-shipments-and-new-postal-informal-entry", checked: r.checked }} compact /><span>No duty-free allowance: every parcel pays, on its {us.basis} value.</span></li>
              <li className="flex items-start gap-2"><SourceTag source={r.channels.find((c) => c.id === "amazon_us")!.vat_source} compact /><span>Sales tax is collected by the marketplace, so it is not in your margin.</span></li>
            </ul>
            <table className="w-full text-[13px]">
              <thead><tr className="text-[12px] text-muted"><th className="pb-1.5 text-left font-normal">Category</th><th className="pb-1.5 text-left font-normal">Typical line</th><th className="pb-1.5 text-right font-normal">Rate</th></tr></thead>
              <tbody>
                {Object.entries(r.categories).map(([k, name]) => (
                  <tr key={k} className="border-t border-rule">
                    <td className="py-1.5 pr-2">{name}</td>
                    <td className="py-1.5 pr-2 text-ink-2"><span className="inline-flex items-center gap-1.5"><SourceTag source={{ kind: r.us_mfn_lines[k].kind, label: r.us_mfn_lines[k].what, url: "https://hts.usitc.gov/", checked: r.checked }} compact /><span className="num">{r.us_mfn_lines[k].line}</span></span></td>
                    <td className="num py-1.5 text-right">{pct(us.category_rates[k], 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3 className="mb-2 text-[14px] font-medium">United Kingdom</h3>
            <ul className="mb-3 space-y-1.5 text-[13px] text-ink-2">
              <li className="flex items-start gap-2"><SourceTag source={r.channels.find((c) => c.id === "amazon_uk")!.vat_source} compact /><span>VAT of 20% is inside the shelf price and goes to HMRC through the marketplace.</span></li>
              <li className="flex items-start gap-2"><SourceTag source={{ ...uk.source, kind: "fact" }} compact /><span>No customs duty on parcels worth £{uk.relief_threshold} or less. This relief ends by October 2028.</span></li>
            </ul>
            <table className="w-full text-[13px]">
              <thead><tr className="text-[12px] text-muted"><th className="pb-1.5 text-left font-normal">Over £{uk.relief_threshold}, {uk.basis} value</th><th className="pb-1.5 text-right font-normal">Rate</th></tr></thead>
              <tbody>
                {Object.entries(r.categories).map(([k, name]) => (
                  <tr key={k} className="border-t border-rule">
                    <td className="py-1.5"><span className="inline-flex items-center gap-1.5"><SourceTag source={uk.source} compact />{name}</span></td>
                    <td className="num py-1.5 text-right">{pct(uk.category_rates[k], 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section title="Exchange rates" about="Converted at the European Central Bank reference rate, refreshed every 12 hours.">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
          {Object.entries(r.fx.rates).filter(([c]) => c !== "USD").map(([c, v]) => (
            <p key={c} className="text-[14px]"><span className="text-muted">$1 =</span> <span className="figure text-[22px]">{num(v, c === "INR" ? 2 : 4)}</span> <span className="text-muted">{c}</span></p>
          ))}
          <span className="ml-auto"><SourceTag source={r.fx.source} /></span>
        </div>
        {r.fx.source.kind !== "fact" && <div className="mt-3"><Notice>{r.fx.source.label}</Notice></div>}
      </Section>
    </>
  );
}

export default function RulesPage() {
  const { data, isLoading, isError, error } = useQuery({ queryKey: ["rules"], queryFn: api.rules });
  return (
    <div className="max-w-[1180px]">
      <PageTitle title="Rules and sources" sub="Every number Tradelane uses, where it came from and when it was checked. Edit your own; the published ones link to their source." />
      {isLoading && <div aria-busy="true">{[0, 1, 2].map((i) => <Bar key={i} className="mb-6 block h-40 w-full" />)}</div>}
      {isError && <Notice tone="error">Couldn't load the rules: {(error as Error).message}</Notice>}
      {data && <Content r={data} />}
    </div>
  );
}
