"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/browser";

type Row = { id: string; title: string | null; question: string; cost_usd: number; cost_detail: { lines?: { step: string; usd: number }[]; eleven_chars?: number } | null; created_at: string };

/** What the AI behind this month's new episodes cost (estimated from list prices). */
export function CostCard({ familyId }: { familyId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    supabase()
      .from("episodes")
      .select("id, title, question, cost_usd, cost_detail, created_at")
      .eq("created_by_family", familyId)
      .gte("created_at", start)
      .order("created_at", { ascending: false })
      .then(({ data }) => setRows((data ?? []) as Row[]));
  }, [familyId]);

  const tracked = rows.filter((r) => Number(r.cost_usd) > 0);
  const total = tracked.reduce((s, r) => s + Number(r.cost_usd), 0);
  const chars = tracked.reduce((s, r) => s + (r.cost_detail?.eleven_chars ?? 0), 0);
  const usd = (n: number) => `US$${n.toFixed(2)}`;

  return (
    <section className="card space-y-2">
      <h3 className="text-lg font-semibold">AI costs this month</h3>
      {tracked.length === 0 ? (
        <p className="text-slate-500">Costs show here for new episodes made from now on.</p>
      ) : (
        <>
          <p>
            About <b>{usd(total)}</b> for {tracked.length} episode{tracked.length === 1 ? "" : "s"} (average {usd(total / tracked.length)}), plus{" "}
            {Math.round(chars / 1000)}k ElevenLabs voice characters from your plan.
          </p>
          <button className="text-sm text-slate-500 underline" onClick={() => setOpen((o) => !o)}>
            {open ? "Hide details" : "Show each episode"}
          </button>
          {open && (
            <ul className="space-y-2 text-sm">
              {tracked.map((r) => {
                const steps: Record<string, number> = {};
                for (const l of r.cost_detail?.lines ?? []) steps[l.step] = (steps[l.step] ?? 0) + l.usd;
                return (
                  <li key={r.id} className="rounded-xl bg-orange-50 p-2">
                    <div className="flex justify-between gap-2 font-semibold">
                      <span>{r.title ?? r.question}</span>
                      <span>{usd(Number(r.cost_usd))}</span>
                    </div>
                    <p className="text-slate-500">
                      {Object.entries(steps)
                        .map(([k, v]) => `${k} ${usd(v)}`)
                        .join(" · ")}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-slate-400">Estimated from list prices. Your provider dashboards have the exact bill.</p>
        </>
      )}
    </section>
  );
}
