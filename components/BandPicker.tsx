"use client";
import { BANDS, type Band } from "@/lib/types";

/** Pick the listening level: Littles 2–3, Bigs 4–6, Explorers 7–10 (optionally "Any"). */
export function BandPicker({
  value,
  onChange,
  allowAny = false,
}: {
  value: Band | null;
  onChange: (b: Band | null) => void;
  allowAny?: boolean;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="Listening level">
      {allowAny && (
        <button
          role="radio"
          aria-checked={value === null}
          className={`rounded-full px-4 py-2 font-display text-base ${value === null ? "bg-ink text-white" : "bg-white ring-1 ring-slate-200"}`}
          onClick={() => onChange(null)}
        >
          Any age
        </button>
      )}
      {BANDS.map((b) => (
        <button
          key={b.id}
          role="radio"
          aria-checked={value === b.id}
          className="rounded-full px-4 py-2 font-display text-base ring-1 ring-slate-200"
          style={value === b.id ? { background: b.colour, color: "white" } : { background: "white" }}
          onClick={() => onChange(b.id)}
        >
          {b.label} <span className="opacity-80">{b.ages}</span>
        </button>
      ))}
    </div>
  );
}
