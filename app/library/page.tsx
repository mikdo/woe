"use client";
import { useEffect, useMemo, useState } from "react";
import { X } from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase/browser";
import { useFamily, useSession } from "@/lib/hooks";
import { BANDS, CATEGORIES } from "@/lib/types";
import { EpisodeCard, type EpisodeLite } from "@/components/EpisodeCard";
import { InTheWorks } from "@/components/InTheWorks";
import { Art, PillSelect } from "@/components/SkyPage";

const FIELDS = "id, title, question, category, art_path, cheko_form, status, band, bedtime, kind";
type Heard = "any" | "new" | "heard";

export default function Library() {
  const { session } = useSession();
  const { kids } = useFamily(Boolean(session));
  const [tab, setTab] = useState<"ours" | "everyone">("ours");
  const [episodes, setEpisodes] = useState<EpisodeLite[] | null>(null);
  const [listens, setListens] = useState<Map<string, { heard: boolean; progress: number }>>(new Map());
  // Everything starts wide open: all ages, all topics, heard or not.
  const [band, setBand] = useState<string>("any");
  const [cat, setCat] = useState<string>("any");
  const [heard, setHeard] = useState<Heard>("any");
  const [listener, setListener] = useState<string>("all");

  useEffect(() => {
    if (!session) return;
    let stop = false;
    (async () => {
      setEpisodes(null);
      const [eps, ls] = await Promise.all([
        tab === "ours"
          ? supabase().from("family_library").select(`favourite, episodes(${FIELDS})`).order("added_at", { ascending: false })
          : supabase().from("episodes").select(FIELDS).eq("shared", true).eq("status", "ready").order("created_at", { ascending: false }).limit(200),
        supabase().from("listens").select("episode_id, heard, position, duration"),
      ]);
      if (stop) return;
      const list =
        tab === "ours"
          ? ((eps.data ?? []) as unknown as { favourite: boolean; episodes: EpisodeLite }[]).map((r) => ({ ...r.episodes, favourite: r.favourite }))
          : ((eps.data ?? []) as EpisodeLite[]);
      // One entry per episode, so the same episode listed for two kids shows once.
      const seen = new Set<string>();
      setEpisodes(list.filter((e) => e?.status === "ready" && !seen.has(e.id) && seen.add(e.id)));
      const m = new Map<string, { heard: boolean; progress: number }>();
      for (const l of (ls.data ?? []) as { episode_id: string; heard: boolean; position: number; duration: number }[]) {
        const cur = m.get(l.episode_id) ?? { heard: false, progress: 0 };
        m.set(l.episode_id, { heard: cur.heard || l.heard, progress: Math.max(cur.progress, l.duration ? l.position / l.duration : 0) });
      }
      setListens(m);
    })();
    return () => {
      stop = true;
    };
  }, [session, tab]);

  const shown = useMemo(
    () =>
      (episodes ?? [])
        .map((e) => ({ ...e, ...(listens.get(e.id) ?? {}) }))
        .filter((e) => band === "any" || e.band === band)
        .filter((e) => cat === "any" || e.category === cat)
        .filter((e) => heard === "any" || (heard === "heard" ? e.heard : !e.heard))
        .sort((a, b) => Number(Boolean(b.favourite)) - Number(Boolean(a.favourite))),
    [episodes, listens, band, cat, heard],
  );
  const filtered = band !== "any" || cat !== "any" || heard !== "any";
  const clear = () => {
    setBand("any");
    setCat("any");
    setHeard("any");
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-5 p-6" style={{ paddingTop: "calc(env(safe-area-inset-top) + 20px)" }}>
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-3xl font-black">Library</h1>
        <div className="flex rounded-full bg-white p-1 ring-1 ring-slate-200" role="tablist">
          {(["ours", "everyone"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`press rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${tab === t ? "bg-ink text-white" : "text-slate-500"}`}
            >
              {t === "ours" ? "Ours" : "Everyone's"}
            </button>
          ))}
        </div>
      </div>

      <InTheWorks />

      <div className="-mx-6 flex items-center gap-2 overflow-x-auto px-6 pb-1">
        <PillSelect
          label="Age"
          value={band}
          active={band !== "any"}
          onChange={setBand}
          options={[{ value: "any", label: "All ages" }, ...BANDS.map((b) => ({ value: b.id, label: `${b.label} ${b.ages}` }))]}
        />
        <PillSelect
          label="Topic"
          value={cat}
          active={cat !== "any"}
          onChange={setCat}
          options={[{ value: "any", label: "All topics" }, ...CATEGORIES.map((c) => ({ value: c.id, label: `${c.emoji} ${c.label}` }))]}
        />
        <PillSelect
          label="Heard"
          value={heard}
          active={heard !== "any"}
          onChange={setHeard}
          options={[
            { value: "any", label: "Heard or not" },
            { value: "new", label: "Not heard yet" },
            { value: "heard", label: "Heard" },
          ]}
        />
        {kids.length > 1 && (
          <PillSelect
            label="Playing for"
            value={listener}
            onChange={setListener}
            options={[{ value: "all", label: "For all of us" }, ...kids.map((k) => ({ value: k.id, label: `For ${k.name}` }))]}
          />
        )}
        {filtered && (
          <button onClick={clear} className="press flex shrink-0 items-center gap-1 px-2 text-sm font-bold text-ember">
            <X weight="bold" /> Clear
          </button>
        )}
      </div>

      {episodes === null ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3" aria-busy>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton aspect-[4/5] rounded-3xl" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="pop-in flex flex-col items-center gap-3 py-16 text-center text-slate-500">
          <Art name="library-empty" className="max-h-40 object-contain" fallback={<span className="text-5xl">🔭</span>} />
          <p className="text-lg">{filtered ? "Nothing matches those filters." : tab === "ours" ? "No adventures yet. Ask Otto a question!" : "Nothing here yet."}</p>
          {filtered && (
            <button className="btn-soft py-2 text-sm" onClick={clear}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="-mb-2 text-sm font-semibold text-slate-500">
            {shown.length} adventure{shown.length === 1 ? "" : "s"}
          </p>
          <div key={`${tab}${band}${cat}${heard}`} className="stagger grid grid-cols-2 gap-4 sm:grid-cols-3">
            {shown.map((e) => (
              <EpisodeCard key={e.id} episode={e} href={`/e/${e.id}?kid=${listener}`} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
