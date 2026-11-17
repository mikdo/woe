"use client";
import { useState, type ReactNode } from "react";
import { artSrc } from "@/lib/art";

/**
 * The WOE! page shape: a sky header (illustration or big title) with a cream sheet over it.
 * Pull the handle down to reveal more of the sky (e.g. to find Cheko), or up to read more.
 */
export function SkyPage({
  hero,
  children,
  heroClassName = "",
  canPeek = false,
}: {
  hero: ReactNode;
  children: ReactNode;
  heroClassName?: string;
  canPeek?: boolean;
}) {
  const [peek, setPeek] = useState(false);
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col bg-cream">
      <div
        className={`relative overflow-hidden bg-sky-wash px-6 pb-12 transition-[min-height] duration-500 ${heroClassName}`}
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)", minHeight: peek ? "70dvh" : undefined }}
      >
        {hero}
      </div>
      <section className="relative -mt-8 flex flex-1 flex-col gap-6 rounded-t-[2rem] border-t-[6px] border-ember bg-cream px-6 pb-6 pt-3">
        {canPeek ? (
          <button
            className="mx-auto -mb-2 flex h-6 w-16 items-center justify-center"
            aria-label={peek ? "Show less of the picture" : "Show more of the picture"}
            onClick={() => setPeek((p) => !p)}
          >
            <span className="h-1.5 w-10 rounded-full bg-ink/25" />
          </button>
        ) : (
          <span className="mx-auto mb-1 h-1.5 w-10 rounded-full bg-ink/15" aria-hidden />
        )}
        {children}
      </section>
    </main>
  );
}

/**
 * One of Mikey's drawings from /public/art (e.g. /art/home.webp). The slots are listed in lib/art.ts.
 * Until the drawing exists, the fallback shows instead.
 */
export function Art({ name, alt = "", className = "", fallback }: { name: string; alt?: string; className?: string; fallback: ReactNode }) {
  const [missing, setMissing] = useState(false);
  if (missing) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={artSrc(name)} alt={alt} className={className} onError={() => setMissing(true)} />
  );
}

/** A compact pill that opens the phone's own picker (native select underneath). */
export function PillSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  active,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  active?: boolean;
}) {
  const current = options.find((o) => o.value === value)?.label ?? label;
  return (
    <label
      className={`press relative inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold ring-1 ${
        active ? "bg-ink text-white ring-ink" : "bg-white text-ink ring-slate-200"
      }`}
    >
      <span>{current}</span>
      <svg width="12" height="12" viewBox="0 0 256 256" aria-hidden fill="currentColor">
        <path d="M213.7 101.7l-80 80a8 8 0 0 1-11.4 0l-80-80a8 8 0 0 1 11.4-11.4L128 164.7l74.3-74.4a8 8 0 0 1 11.4 11.4Z" />
      </svg>
      <select
        aria-label={label}
        className="absolute inset-0 cursor-pointer opacity-0"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
