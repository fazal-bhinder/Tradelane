import { motion } from "motion/react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Mode = "light" | "dark" | "system";
const read = (): Mode => {
  try {
    const t = localStorage.getItem("tl-theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
};

export function useTheme() {
  const [mode, setMode] = useState<Mode>(read);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", mode === "dark" || (mode === "system" && media.matches));
    apply();
    try {
      if (mode === "system") localStorage.removeItem("tl-theme");
      else localStorage.setItem("tl-theme", mode);
    } catch {
      /* private mode: the choice just isn't remembered */
    }
    if (mode !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [mode]);
  return [mode, setMode] as const;
}

const OPTIONS: { id: Mode; label: string; Icon: typeof Sun }[] = [
  { id: "light", label: "Light", Icon: Sun },
  { id: "dark", label: "Dark", Icon: Moon },
  { id: "system", label: "System", Icon: Monitor },
];

/** Light / Dark / System, with the selection sliding between them.
 *  `icons` shows the three icons only (sidebar); `compact` is one button that cycles. */
export function ThemeSwitch({ compact = false, icons = false }: { compact?: boolean; icons?: boolean }) {
  const [mode, setMode] = useTheme();
  if (compact) {
    const next = mode === "light" ? "dark" : mode === "dark" ? "system" : "light";
    const Icon = OPTIONS.find((o) => o.id === mode)!.Icon;
    return (
      <motion.button whileTap={{ scale: 0.9, rotate: -20 }} onClick={() => setMode(next)} title={`Theme: ${mode}`} aria-label={`Theme: ${mode}. Switch to ${next}`}
        className="grid size-10 place-items-center rounded-control text-ink-2 hover:bg-raised">
        <Icon size={17} strokeWidth={1.7} />
      </motion.button>
    );
  }
  if (icons) {
    return (
      <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-full bg-raised p-0.5">
        {OPTIONS.map(({ id, label, Icon }) => (
          <button key={id} role="radio" aria-checked={mode === id} aria-label={label} title={label} onClick={() => setMode(id)}
            className={`relative grid size-7 place-items-center rounded-full transition-colors ${mode === id ? "text-ink" : "text-muted hover:text-ink-2"}`}>
            {mode === id && <motion.span layoutId="theme-dot" className="absolute inset-0 rounded-full bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.14)]" transition={{ type: "spring", stiffness: 500, damping: 35 }} />}
            <Icon size={14} strokeWidth={1.8} className="relative" />
          </button>
        ))}
      </div>
    );
  }
  return (
    <div role="radiogroup" aria-label="Theme" className="relative grid grid-cols-3 rounded-full bg-raised p-1">
      {OPTIONS.map(({ id, label, Icon }) => (
        <button key={id} role="radio" aria-checked={mode === id} onClick={() => setMode(id)}
          className={`relative z-10 flex h-7 items-center justify-center gap-1.5 rounded-full text-[12px] transition-colors ${mode === id ? "text-ink" : "text-muted hover:text-ink-2"}`}>
          {mode === id && (
            <motion.span layoutId="theme-pill" className="absolute inset-0 -z-10 rounded-full bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.12)]" transition={{ type: "spring", stiffness: 500, damping: 35 }} />
          )}
          <Icon size={13} strokeWidth={1.8} />
          {label}
        </button>
      ))}
    </div>
  );
}
