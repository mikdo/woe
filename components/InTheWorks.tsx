"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CaretDown, X } from "@phosphor-icons/react";
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

const DISMISSED_KEY = "woe-dismissed-ready";

function readDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<string>) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids].slice(-60)));
  } catch {
    // Private mode: it just won't be remembered.
  }
}

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
  const [open, setOpen] = useState(false);
  // Nothing renders until the first fetch, so reading storage here can't cause a hydration mismatch.
  const [dismissed, setDismissed] = useState<Set<string>>(() => (typeof window === "undefined" ? new Set() : readDismissed()));
  const dismiss = (askId: string) =>
    setDismissed((d) => {
      const next = new Set(d).add(askId);
      saveDismissed(next);
      return next;
    });

  async function retry(episodeId: string) {
    setBusy(episodeId);
    await api(`/api/episodes/${episodeId}/resume`, { method: "POST" }).catch(() => null);
    setTimeout(() => setBusy(null), 4000);
  }

  useEffect(() => {
    let stop = false;
    async function load() {
      // A finished one shows for a few minutes (or until it's tapped or closed).
      const since = Date.now() - 4 * 60 * 1000;
      const { data } = await supabase()
        .from("asks")
        .select("id, text, status, kid_id, for_all, episode_id, episodes!asks_episode_id_fkey(stage, status, title, updated_at)")
        .in("status", ["generating", "ready"])
        .eq("created_new", true)
        .order("created_at", { ascending: false })
        .limit(20);
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

  const visible = rows.filter((r) => !(r.status === "ready" && dismissed.has(r.id)));
  if (visible.length === 0) return null;
  const ready = visible.filter((r) => r.status === "ready");
  const making = visible.filter((r) => r.status !== "ready");
  const stateOf = (r: Row) => {
    const stage = r.episodes?.stage ?? "queued";
    const noCredits = stage === NO_CREDITS;
    const failed = noCredits || stage === "error" || stage === "needs_review" || isStale(r);
    const label = noCredits
      ? "Cheko lost his voice: top up ElevenLabs, then try again"
      : stage === "needs_review"
        ? "A grown-up needs to check a fact"
        : failed
          ? "Got stuck. Trying again…"
          : (STAGES[stage] ?? "Making it…");
    return { stage, noCredits, failed, label };
  };
  const hrefOf = (r: Row) => (r.episode_id ? `/e/${r.episode_id}${r.for_all ? "?kid=all" : r.kid_id ? `?kid=${r.kid_id}` : ""}` : "#");

  // One slim line per episode being made.
  const slim = (r: Row) => {
    const st = stateOf(r);
    return (
      <li key={r.id} className="flex items-center gap-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{r.episodes?.title ?? r.text}</p>
          {st.failed ? (
            <p className="truncate text-xs text-slate-500">
              {st.label}{" "}
              {st.stage !== "needs_review" && r.episode_id && (
                <button className="font-semibold text-sky-700 underline" disabled={busy === r.episode_id} onClick={() => retry(r.episode_id!)}>
                  {busy === r.episode_id ? "Restarting…" : "Try again"}
                </button>
              )}
            </p>
          ) : (
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-orange-100">
              <div className="h-full rounded-full bg-sun transition-all duration-700" style={{ width: `${stageProgress(st.stage) * 100}%` }} />
            </div>
          )}
        </div>
        {!st.failed && <span className="w-24 shrink-0 truncate text-right text-[11px] text-slate-500">{st.label.replace(/…$/, "")}</span>}
      </li>
    );
  };

  const overall = making.length ? making.reduce((n, r) => n + stageProgress(stateOf(r).stage), 0) / making.length : 0;
  const stuck = making.filter((r) => stateOf(r).failed).length;

  return (
    <section className="space-y-2" aria-live="polite">
      {ready.map((r) => (
        <div key={r.id} className="card flex items-center gap-3 p-3 ring-4 ring-sun">
          <Link href={hrefOf(r)} onClick={() => dismiss(r.id)} className="flex min-w-0 flex-1 items-center gap-3 active:scale-[0.98]">
            <span className="text-2xl">🎉</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-base font-semibold">{r.episodes?.title ?? r.text}</p>
              <p className="text-sm text-slate-600">Ready to play! ▶</p>
            </div>
          </Link>
          <button className="press grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-400" onClick={() => dismiss(r.id)} aria-label="Hide">
            <X size={18} weight="bold" />
          </button>
        </div>
      ))}

      {making.length === 1 && <ul className="card px-4 py-1">{making.map(slim)}</ul>}

      {making.length > 1 && (
        <div className="card p-3">
          <button className="flex w-full items-center gap-3 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <span className="bob text-2xl">🛠️</span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-base font-semibold">Making {making.length} episodes</p>
              <p className="text-xs text-slate-500">
                {stuck ? `${stuck} stuck, trying again · ` : ""}
                {open ? "Tap to hide" : "Tap to see them"}
              </p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-orange-100">
                <div className="h-full rounded-full bg-sun transition-all duration-700" style={{ width: `${overall * 100}%` }} />
              </div>
            </div>
            <CaretDown size={18} weight="bold" className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
          {open && <ul className="mt-2 divide-y divide-orange-100 border-t border-orange-100">{making.map(slim)}</ul>}
        </div>
      )}
    </section>
  );
}
