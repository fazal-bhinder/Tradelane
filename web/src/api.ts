export type Kind = "fact" | "assumption" | "ai" | "unknown";
export type Verdict = "list" | "check" | "skip" | "needs-data";

export interface Source {
  kind: Kind;
  label: string;
  url: string | null;
  checked: string | null;
}

export interface Line {
  key: string;
  label: string;
  amount: number;
  source: Source;
}

export interface Swing {
  key: string;
  label: string;
  low: number;
  high: number;
  base: number;
}

export interface LaneReview {
  decision: "approved" | "rejected";
  note: string;
  at: string;
  by: string | null;
}

export interface User {
  id: string;
  name: string;
  role: "buyer" | "approver";
  title: string;
  color: string;
}

export interface Activity {
  id: number;
  user: string | null;
  kind: string;
  message: string;
  product_id: number | null;
  product: string | null;
  channel: string | null;
  at: string;
}

export interface AskStep {
  type: "step";
  label: string;
  tool: string;
  args: Record<string, unknown>;
  status: "running" | "done";
  summary?: string;
}

export interface AskRecord {
  id: number;
  user: string;
  question: string;
  answer: string;
  steps: AskStep[];
  ms: number;
  at: string;
}

export interface Brief {
  text: string;
  by: string;
  ms: number;
  at: string;
  for: string;
}

export interface Lane {
  channel: string;
  lane: string;
  currency: string;
  price: number | null;
  profit: number | null;
  margin: number | null;
  net_revenue: number | null;
  break_even: number | null;
  target_price: number | null;
  verdict: Verdict;
  reasons: string[];
  missing: string[];
  review: LaneReview | null;
  lines?: Line[];
  sensitivity?: Swing[];
  costs?: Record<string, number>;
}

export interface AiSuggestion {
  category?: string;
  hs_code?: string;
  confidence?: number;
  reasoning?: string;
  title?: string;
  bullets?: string[];
  by?: string;
  ms?: number;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  description: string;
  supplier: string;
  unit_cost: number | null;
  cost_currency: string;
  weight_kg: number | null;
  dims_cm: (number | null)[];
  origin: string;
  category: string | null;
  category_kind: Kind;
  hs_code: string | null;
  us_mfn: number | null;
  us_mfn_line: string | null;
  prices: Record<string, number | null>;
  ai: AiSuggestion;
  lanes: Lane[];
  history?: { channel: string; decision: string; note: string; at: string; by: string | null }[];
}

export interface Catalogue {
  products: Product[];
  fx: { rates: Record<string, number>; source: Source };
  target_margin: number;
  ai: boolean;
}

export interface Tier {
  pct: number;
  upto: number | null;
}

export interface Rules {
  checked: string;
  categories: Record<string, string>;
  origins: Record<string, string>;
  fx: { rates: Record<string, number>; source: Source };
  assumptions: { key: string; label: string; unit: string; value: number; default: number; edited: boolean }[];
  routes: { origin: string; dest: string; currency: string; base: number; per_kg: number; transit_days: [number, number]; source: Source }[];
  channels: {
    id: string;
    name: string;
    country: string;
    currency: string;
    vat_rate: number;
    vat_source: Source;
    fees: Record<string, { tiers: Tier[]; whole_price: boolean; min_fee: number; source: Source }>;
  }[];
  duties: Record<string, {
    category_rates: Record<string, number>;
    extra_by_origin: Record<string, number>;
    relief_threshold: number | null;
    basis: string;
    source: Source;
    extra_source: Source;
  }>;
  us_mfn_lines: Record<string, { line: string; what: string; kind: Kind }>;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : undefined,
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* keep the status line */
    }
    throw new ApiError(detail, res.status);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => call<{ ok: boolean; ai: boolean; db_ms: number }>("/health"),
  users: () => call<User[]>("/users"),
  me: () => call<User>("/me"),
  login: (user_id: string) => call<User>("/login", { method: "POST", body: JSON.stringify({ user_id }) }),
  logout: () => call<{ ok: true }>("/logout", { method: "POST" }),
  activity: (limit = 30) => call<Activity[]>(`/activity?limit=${limit}`),
  asks: () => call<AskRecord[]>("/asks"),
  brief: () => call<Brief | null>("/brief"),
  writeBrief: () => call<Brief>("/brief", { method: "POST" }),
  catalogue: () => call<Catalogue>("/products"),
  product: (id: number) => call<Product>(`/products/${id}`),
  patch: (id: number, body: Partial<Pick<Product, "name" | "unit_cost" | "weight_kg" | "category" | "hs_code" | "prices">>) =>
    call<Product>(`/products/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  classify: (id: number) => call<Product>(`/products/${id}/classify`, { method: "POST" }),
  remove: (id: number) => call<{ ok: true }>(`/products/${id}`, { method: "DELETE" }),
  sample: () => call<{ imported: number; errors: string[] }>("/products/sample", { method: "POST" }),
  importFile: (file: File, replaceAll: boolean) => {
    const fd = new FormData();
    fd.append("file", file);
    return call<{ imported: number; errors: string[] }>(`/products/import?replace_all=${replaceAll}`, { method: "POST", body: fd });
  },
  review: (body: { product_id: number; channel: string; decision: "approved" | "rejected"; note?: string }) =>
    call<{ ok: true }>("/reviews", { method: "POST", body: JSON.stringify(body) }),
  rules: () => call<Rules>("/rules"),
  setRule: (key: string, value: number) => call<{ ok: true }>("/rules", { method: "PUT", body: JSON.stringify({ key, value }) }),
  resetRule: (key: string) => call<{ ok: true }>(`/rules/${encodeURIComponent(key)}`, { method: "DELETE" }),
};

export const CHANNELS: { id: string; name: string; short: string }[] = [
  { id: "amazon_uk", name: "Amazon UK", short: "Amazon UK" },
  { id: "amazon_us", name: "Amazon US", short: "Amazon US" },
  { id: "walmart_us", name: "Walmart US", short: "Walmart US" },
];

export type AskEvent = AskStep | { type: "answer"; text: string; id: number; ms: number } | { type: "error"; message: string };

/** Streams the analyst's steps and answer as server-sent events. */
export async function ask(question: string, sku: string | undefined, onEvent: (e: AskEvent) => void, signal?: AbortSignal) {
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, sku }),
    signal,
  });
  if (!res.ok || !res.body) throw new ApiError(`The analyst is unavailable (${res.status})`, res.status);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i).trim();
      buf = buf.slice(i + 2);
      if (chunk.startsWith("data:")) onEvent(JSON.parse(chunk.slice(5)));
    }
  }
}
