/** Stripe's gradient mesh: soft blobs of cream, sherbet, lavender, indigo and ruby
 *  drifting behind the top of the page. Purely decorative. */
export function Mesh({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-x-0 top-0 h-[300px] overflow-hidden dark:hidden ${className}`}>
      <div className="absolute inset-0 [mask-image:linear-gradient(to_bottom,black_35%,transparent)] dark:opacity-70">
        <div className="absolute -top-24 right-[-6%] h-[340px] w-[560px] rounded-full bg-mesh-lavender opacity-70 blur-3xl motion-safe:animate-drift-a" />
        <div className="absolute -top-28 right-[22%] h-[300px] w-[420px] rounded-full bg-mesh-orange opacity-55 blur-3xl motion-safe:animate-drift-b" />
        <div className="absolute -top-36 right-[40%] h-[280px] w-[520px] rounded-full bg-mesh-cream opacity-90 blur-3xl motion-safe:animate-drift-c" />
        <div className="absolute -top-10 right-[8%] h-[200px] w-[300px] rounded-full bg-indigo opacity-35 blur-3xl motion-safe:animate-drift-b" />
        <div className="absolute top-2 right-[30%] h-[150px] w-[240px] rounded-full bg-ruby opacity-25 blur-3xl motion-safe:animate-drift-a" />
        <div className="absolute -top-16 right-[55%] h-[180px] w-[260px] rounded-full bg-magenta opacity-20 blur-3xl motion-safe:animate-drift-c" />
      </div>
    </div>
  );
}
