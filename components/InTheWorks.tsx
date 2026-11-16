"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { STAGES, stageProgress } from "@/lib/stages";

type Row = {
  id: string;
  text: string;
  status: string;
  kid_id: string | null;
  for_all: boolean;
  episode_id: string | null;
  episodes: { stage: string | null; status: string; title: string | null; updated_at: string | null } | null;
};

/**
 * Episodes being made for this family right now, with where they're up to.
 * Shows a "ready" card for a few minutes after one finishes.
 */
export function InTheWorks({ kidId, onReady }: { kidId?: string; onReady?: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    let stop = false;
    async function load() {
      const since = Date.now() - 10 * 60 * 1000;
      const { data } = await supabase()
        .from("asks")
        .select("id, text, status, kid_id, for_all, episode_id, episodes(stage, status, title, updated_at)")
        .in("status", ["generating", "ready"])
        .eq("created_new", true)
        .order("created_at", { ascending: false })
        .limit(12);
      if (stop) return;
      let list = ((data ?? []) as unknown as Row[]).filter(
        (r) => r.status === "generating" || (r.episodes?.updated_at && new Date(r.episodes.updated_at).getTime() > since),
      );
      if (kidId && kidId !== "all") list = list.filter((r) => r.kid_id === kidId || r.for_all);
      if (kidId === "all") list = list.filter((r) => r.for_all);
      for (const r of list) {
        if (r.status === "ready" && seen.current.has(`${r.id}:generating`) && !seen.current.has(`${r.id}:ready`)) onReady?.();
        seen.current.add(`${r.id}:${r.status}`);
      }
      setRows(list);
    }
    load();
    const t = setInterval(load, 5000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [kidId, onReady]);

  if (rows.length === 0) return null;
  return (
    <section className="space-y-2" aria-live="polite">
      {rows.map((r) => {
        const stage = r.episodes?.stage ?? "queued";
        const ready = r.status === "ready";
        const failed = stage === "error" || stage === "needs_review";
        const href = r.episode_id ? `/e/${r.episode_id}${r.for_all ? "?kid=all" : r.kid_id ? `?kid=${r.kid_id}` : ""}` : "#";
        const body = (
          <div className={`card flex items-center gap-3 p-3 ${ready ? "ring-4 ring-sun" : ""}`}>
            <span className={`text-3xl ${ready ? "" : "bob"}`}>{ready ? "🎉" : failed ? "🧐" : "🛠️"}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-lg font-semibold">{r.episodes?.title ?? r.text}</p>
              <p className="text-sm text-slate-600">
                {ready ? "Ready to play!" : failed ? "Needs a grown-up to check it" : STAGES[stage] ?? "Making it…"}
              </p>
              {!ready && !failed && (
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-orange-100">
                  <div className="h-full rounded-full bg-sun transition-all duration-700" style={{ width: `${stageProgress(stage) * 100}%` }} />
                </div>
              )}
            </div>
            {ready && <span className="text-2xl">▶</span>}
          </div>
        );
        return ready ? (
          <Link key={r.id} href={href} className="block transition active:scale-[0.98]">
            {body}
          </Link>
        ) : (
          <div key={r.id}>{body}</div>
        );
      })}
    </section>
  );
}
