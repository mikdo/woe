/** Placeholder WOE! wordmark: the O is a little globe. Swap for Mikey's lettering in Phase 2. */
export function Logo({ size = 64 }: { size?: number }) {
  return (
    <div className="flex items-center font-display font-bold leading-none text-ink" style={{ fontSize: size }}>
      <span>W</span>
      <svg viewBox="0 0 100 100" style={{ width: size * 0.82, height: size * 0.82 }} className="mx-0.5" aria-hidden>
        <circle cx="50" cy="50" r="46" fill="#38bdf8" stroke="#1e293b" strokeWidth="6" />
        <path d="M22 38c10-6 18 2 26-4s8-14 18-10 12 14 6 20-16 4-20 12 4 16-6 20-16-6-20-14-12-14-4-24z" fill="#22c55e" stroke="#1e293b" strokeWidth="4" strokeLinejoin="round" />
      </svg>
      <span>E</span>
      <span className="text-sun">!</span>
    </div>
  );
}
