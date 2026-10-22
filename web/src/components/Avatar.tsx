import type { User } from "../api";

const FALLBACK: Record<string, { name: string; color: string }> = {
  asha: { name: "Asha Mehta", color: "#533afd" },
  rohan: { name: "Rohan Kapoor", color: "#ea2261" },
};

export function Avatar({ user, id, size = 28 }: { user?: Pick<User, "name" | "color"> | null; id?: string | null; size?: number }) {
  const u = user ?? (id ? FALLBACK[id] : undefined);
  if (!u) {
    return <span className="inline-grid shrink-0 place-items-center rounded-full bg-raised text-[11px] font-medium text-muted" style={{ width: size, height: size }}>TL</span>;
  }
  const initials = u.name.split(" ").map((p) => p[0]).join("").slice(0, 2);
  // identity colours stay out of blue and purple in dark mode
  const dark = u.color.toLowerCase() === "#533afd" ? "dark:bg-[#d97706]!" : "";
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded-full font-semibold text-white ring-2 ring-surface ${dark}`}
      style={{ width: size, height: size, background: u.color, fontSize: Math.round(size * 0.38) }}
      aria-label={u.name}
      title={u.name}
    >
      {initials}
    </span>
  );
}

export const firstName = (id: string | null | undefined) => (id ? (FALLBACK[id]?.name.split(" ")[0] ?? id) : "Tradelane");
