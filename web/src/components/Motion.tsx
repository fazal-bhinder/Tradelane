import { animate, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** A number that counts up to its value when it scrolls into view, and glides on change. */
export function CountUp({ value, format = (v) => Math.round(v).toLocaleString("en-GB"), className = "" }: { value: number | null; format?: (v: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (value == null || !seen) return;
    if (reduce) return setShown(value);
    const c = animate(from.current, value, { duration: 0.9, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setShown(v) });
    from.current = value;
    return () => c.stop();
  }, [value, seen, reduce]);
  return <span ref={ref} data-value={value ?? ""} className={`num ${className}`}>{value == null ? "—" : format(shown)}</span>;
}

/** Children rise in one after another when the block enters the screen. */
export function Rise({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** A bar that grows to its width when first seen. */
export function GrowBar({ pct, className = "", delay = 0, style }: { pct: number; className?: string; delay?: number; style?: React.CSSProperties }) {
  return (
    <motion.span
      className={`block h-full ${className}`}
      style={style}
      initial={{ width: 0 }}
      whileInView={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      animate={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      viewport={{ once: true }}
      transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
    />
  );
}
