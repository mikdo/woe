"use client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { api, supabase } from "@/lib/supabase/browser";
import { useSession } from "@/lib/hooks";
import { Cheko, Otto } from "@/components/Characters";
import { CATEGORIES, type ClaimCheck } from "@/lib/types";

type Item = { url: string; pause_after_s: number; caption: string; kind: string };
type PlayData = {
  episode: {
    id: string;
    title: string;
    question: string;
    category: string | null;
    cheko_form: string | null;
    art_url: string | null;
    talk_about_it: string[];
    new_words: { word: string; say_as: string }[];
  };
  items: Item[];
  sfx: Record<string, string>;
  sources: { id: string; fact: string; url: string; title?: string }[];
  checks: ClaimCheck[];
};
type Mode = "idle" | "sfx" | "main" | "pause" | "done";

export default function PlayerPage() {
  return (
    <Suspense fallback={null}>
      <Player />
    </Suspense>
  );
}

function Player() {
  const { id } = useParams<{ id: string }>();
  const kid = useSearchParams().get("kid");
  const { session } = useSession();
  const [data, setData] = useState<PlayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [mode, setMode] = useState<Mode>("idle");
  const [showWords, setShowWords] = useState(false);
  const [grownUp, setGrownUp] = useState(false);
  const [fav, setFav] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const modeRef = useRef<Mode>("idle");
  const idxRef = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!session) return;
    api<PlayData>(`/api/episodes/${id}/play${kid ? `?kid=${kid}` : ""}`)
      .then(setData)
      .catch((e) => setError(e.message));
    supabase()
      .from("family_library")
      .select("favourite")
      .eq("episode_id", id)
      .maybeSingle()
      .then(({ data }) => setFav(Boolean(data?.favourite)));
  }, [session, id, kid]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function set(m: Mode, i = idxRef.current) {
    modeRef.current = m;
    idxRef.current = i;
    setMode(m);
    setIdx(i);
  }

  function playMain(i: number) {
    if (!data || !audio.current) return;
    set("main", i);
    audio.current.src = data.items[i].url;
    audio.current.play().catch(() => set("idle", i));
  }

  function startItem(i: number) {
    if (!data || !audio.current) return;
    const it = data.items[i];
    if (!it) return set("done", 0);
    const key = it.kind.startsWith("sfx:") ? it.kind.slice(4) : null;
    if (key && data.sfx[key]) {
      set("sfx", i);
      audio.current.src = data.sfx[key];
      audio.current.play().catch(() => playMain(i));
    } else playMain(i);
  }

  function onEnded() {
    const i = idxRef.current;
    if (modeRef.current === "sfx") return playMain(i);
    if (modeRef.current !== "main" || !data) return;
    const pause = data.items[i]?.pause_after_s ?? 0;
    if (pause > 0) {
      set("pause", i);
      timer.current = setTimeout(() => startItem(i + 1), pause * 1000);
    } else startItem(i + 1);
  }

  function toggle() {
    if (!audio.current) return;
    if (mode === "idle" || mode === "done") return startItem(mode === "done" ? 0 : idx);
    if (mode === "pause") {
      if (timer.current) clearTimeout(timer.current);
      return startItem(idx + 1);
    }
    if (audio.current.paused) audio.current.play();
    else {
      audio.current.pause();
      set("idle", idx);
    }
  }

  function jump(delta: number) {
    if (!data) return;
    if (timer.current) clearTimeout(timer.current);
    const next = Math.max(0, Math.min(data.items.length - 1, idx + delta));
    startItem(next);
  }

  async function toggleFav() {
    const next = !fav;
    setFav(next);
    await supabase().from("family_library").update({ favourite: next }).eq("episode_id", id);
  }

  if (error) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-6xl">🔎</p>
        <p className="text-xl">{error}</p>
        <Link className="btn-soft" href="/">Home</Link>
      </main>
    );
  }
  if (!data) return null;
  const cat = CATEGORIES.find((c) => c.id === data.episode.category);
  const current = data.items[idx];
  const playing = mode === "main" || mode === "sfx" || mode === "pause";

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-5 p-6" style={{ background: `linear-gradient(${cat?.colour ?? "#38bdf8"}33, transparent 50%)` }}>
      <header className="flex items-center justify-between">
        <Link href={kid ? `/kid/${kid}` : "/library"} className="btn-soft px-4 py-2 text-base">← Back</Link>
        <button onClick={toggleFav} className="text-3xl" aria-label="Favourite">{fav ? "⭐" : "☆"}</button>
      </header>

      <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-[2rem] shadow-[0_8px_0_rgba(0,0,0,.1)]" style={{ background: cat?.colour ?? "#38bdf8" }}>
        {data.episode.art_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.episode.art_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-8xl">{cat?.emoji ?? "🌏"}</div>
        )}
        <div className="absolute bottom-3 left-3 flex items-end gap-2">
          <Otto size={56} />
          <div className={playing ? "bob" : ""}><Cheko form={data.episode.cheko_form} size={48} /></div>
        </div>
      </div>

      <h1 className="text-center text-3xl font-bold">{data.episode.title}</h1>

      <div className="flex items-center justify-center gap-5">
        <button className="btn-soft h-16 w-16 rounded-full text-2xl" onClick={() => jump(-1)} aria-label="Back a bit">⏮</button>
        <button className="btn-primary h-24 w-24 rounded-full text-4xl" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
          {playing && mode !== "pause" ? "⏸" : "▶"}
        </button>
        <button className="btn-soft h-16 w-16 rounded-full text-2xl" onClick={() => jump(1)} aria-label="Skip ahead">⏭</button>
      </div>

      <div className="flex justify-center gap-1.5" aria-hidden>
        {data.items.map((_, i) => (
          <span key={i} className={`h-2.5 rounded-full transition-all ${i === idx ? "w-6 bg-sun" : i < idx ? "w-2.5 bg-sun/50" : "w-2.5 bg-slate-200"}`} />
        ))}
      </div>

      {mode === "pause" && <p className="text-center font-display text-2xl">🤔 What do you think?</p>}
      {mode === "done" && <p className="text-center font-display text-2xl">Stay curious! 🌏</p>}

      <button className="self-center text-sm font-semibold text-slate-500 underline" onClick={() => setShowWords((s) => !s)}>
        {showWords ? "Hide the words" : "Show the words"}
      </button>
      {showWords && current && <p className="card whitespace-pre-line text-lg">{current.caption}</p>}

      <audio ref={audio} onEnded={onEnded} onError={() => (modeRef.current === "sfx" ? playMain(idxRef.current) : null)} preload="auto" />

      <button className="btn-soft self-center" onClick={() => setGrownUp((g) => !g)}>
        {grownUp ? "Close grown-up notes" : "For grown-ups"}
      </button>
      {grownUp && (
        <section className="card space-y-5">
          {data.episode.talk_about_it.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold">Talk about it</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5">{data.episode.talk_about_it.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
          )}
          {data.episode.new_words.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold">New words</h2>
              <p className="mt-1">{data.episode.new_words.map((w) => `${w.word} (${w.say_as})`).join(", ")}</p>
            </div>
          )}
          <div>
            <h2 className="text-xl font-semibold">Facts checked ✓</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {data.checks.map((c, i) => (
                <li key={i} className="flex gap-2">
                  <span>{c.verdict === "supported" ? "✅" : c.verdict === "simplified_ok" ? "🟢" : "⚠️"}</span>
                  <span>
                    {c.claim}
                    {c.source_url && (
                      <> · <a className="text-sky-700 underline" href={c.source_url} target="_blank" rel="noreferrer">source</a></>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-xl font-semibold">Research sources</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {data.sources.map((s) => (
                <li key={s.id}>
                  <a className="text-sky-700 underline" href={s.url} target="_blank" rel="noreferrer">{s.title || s.url}</a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </main>
  );
}
