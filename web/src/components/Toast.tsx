import { AnimatePresence, motion } from "motion/react";
import { Check, X } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Toast = { id: number; text: string; tone: "ok" | "error" };
const Ctx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});

export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, text, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3600);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="pointer-events-auto flex items-center gap-2 rounded-full bg-navy px-4 py-2.5 text-[13px] text-white shadow-[0_12px_32px_rgb(13_37_61/0.28)]"
            >
              <span className={`grid size-5 place-items-center rounded-full ${t.tone === "ok" ? "bg-positive" : "bg-negative"}`}>
                {t.tone === "ok" ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
              </span>
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
