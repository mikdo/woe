"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, supabase } from "@/lib/supabase/browser";
import { NO_CREDITS, STAGES, stageProgress } from "@/lib/stages";

type Row = {
  id: string;
  text: string;
  status: string;
  kid_id: string | null;
  for_all: boolean;
  episode_id: string | null;
  episodes: { stage: string | null; status: string; title: string | null; updated_at: string | null } | null;
};

function isStale(r: Row) {
  const t = r.episodes?.updated_at ? new Date(r.episodes.updated_at).getTime() : 0;
  return r.status === "generating" && t > 0 && Date.now() - t > 8 * 60 * 1000;
}

/**
 * Episodes being made for this family right now, with where they're up to.
 * Shows a "ready" card for a few minutes after one finishes.
 */
export function InTheWorks({ kidId, onReady }: { kidId?: string; onReady?: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const seen = useRef(new Set<string>());
  const retried = useRef(new Set<string>());
  const [busy, setBusy] = useState<string | null>(null);

  async function retry(episodeId: string) {
    setBusy(episodeId);
    await api(`/api/episodes/${episodeId}/resume`, { method: "POST" }).catch(() => null);
    setTimeout(() => setBusy(null), 4000);
  }

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
        // A stalled or failed episode gets one automatic restart per visit.
        // Not when the voice credits ran out: that needs a top-up first, then a tap on Try again.
        const parked = r.episodes?.stage === NO_CREDITS;
        const stalled = r.status === "generating" && r.episode_id && !parked && (r.episodes?.stage === "error" || isStale(r));
        if (stalled && !retried.current.has(r.episode_id!)) {
          retried.current.add(r.episode_id!);
          api(`/api/episodes/${r.episode_id}/resume`, { method: "POST" }).catch(() => null);
        }
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
        const noCredits = stage === NO_CREDITS;
        const failed = noCredits || stage === "error" || stage === "needs_review" || isStale(r);
        const href = r.episode_id ? `/e/${r.episode_id}${r.for_all ? "?kid=all" : r.kid_id ? `?kid=${r.kid_id}` : ""}` : "#";
        const body = (
          <div className={`card flex items-center gap-3 p-3 ${ready ? "ring-4 ring-sun" : ""}`}>
            <span className={`text-3xl ${ready ? "" : "bob"}`}>{ready ? "🎉" : noCredits ? "🦦" : failed ? "🧐" : "🛠️"}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-lg font-semibold">{r.episodes?.title ?? r.text}</p>
              <p className="text-sm text-slate-600">
                {ready
                  ? "Ready to play!"
                  : noCredits
                    ? "Cheko lost his voice: the voice credits ran out. Top up ElevenLabs, then try again."
                    : stage === "needs_review"
                    ? "A grown-up needs to check a fact"
                    : failed
                      ? "Got stuck. Trying again…"
                      : STAGES[stage] ?? "Making it…"}
              </p>
              {failed && stage !== "needs_review" && r.episode_id && (
                <button className="mt-1 text-sm font-semibold text-sky-700 underline" disabled={busy === r.episode_id} onClick={() => retry(r.episode_id!)}>
                  {busy === r.episode_id ? "Restarting…" : "Try again"}
                </button>
              )}
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
