"use client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api, supabase } from "@/lib/supabase/browser";
import { useSession } from "@/lib/hooks";
import { Cheko, Otto } from "@/components/Characters";
import { CATEGORIES, type Activity, type ClaimCheck } from "@/lib/types";
import { usePlayer, type Cue } from "@/components/PlayerProvider";

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
    grownup_fact: string | null;
    activities: Activity[];
  };
  audio: { url: string; duration: number; cues: Cue[] };
  sources: { id: string; fact: string; url: string; title?: string }[];
  checks: ClaimCheck[];
};

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
  const [showWords, setShowWords] = useState(false);
  const [grownUp, setGrownUp] = useState(false);
  const [fav, setFav] = useState(false);
  const [activity, setActivity] = useState<number | null>(null);
  const player = usePlayer();

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

  const { load } = player;
  useEffect(() => {
    if (!data) return;
    load({ id, kid, title: data.episode.title, art: data.episode.art_url, url: data.audio.url, duration: data.audio.duration, cues: data.audio.cues });
  }, [data, id, kid, load]);

  const mine = player.track?.id === id && player.track?.kid === kid;
  const time = mine ? player.time : 0;
  const cues = data?.audio.cues ?? [];
  const think = cues.find((c) => c.think && time >= c.start && time < c.end);
  const spoken = cues.filter((c) => !c.think);
  const curIdx = Math.max(0, spoken.findLastIndex((c) => c.start <= time + 0.05));
  const current = spoken[curIdx];
  const duration = data?.audio.duration ?? 0;
  const done = mine && !player.playing && time >= duration - 1;
  const playing = mine && player.playing;

  function toggle() {
    if (playing) player.pause();
    else player.play();
  }
  function jump(delta: number) {
    const target = spoken[Math.max(0, Math.min(spoken.length - 1, curIdx + delta))];
    if (target) player.seek(delta < 0 && time - (current?.start ?? 0) > 2 ? current.start : target.start);
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
          {playing ? "⏸" : "▶"}
        </button>
        <button className="btn-soft h-16 w-16 rounded-full text-2xl" onClick={() => jump(1)} aria-label="Skip ahead">⏭</button>
      </div>

      <div className="space-y-1">
        <input
          type="range"
          min={0}
          max={Math.max(1, Math.floor(duration))}
          step={1}
          value={Math.floor(time)}
          onChange={(e) => player.seek(Number(e.target.value))}
          className="w-full accent-[var(--color-sun)]"
          aria-label="Where you are in the episode"
        />
        <div className="flex justify-between text-sm font-semibold text-slate-500">
          <span>{clock(time)}</span>
          <span>{clock(duration)}</span>
        </div>
      </div>

      {think && (
        <button className="text-center font-display text-2xl" onClick={() => player.seek(think.end)}>
          🤔 What do you think? <span className="text-base text-slate-500 underline">skip</span>
        </button>
      )}
      {done && <p className="text-center font-display text-2xl">Stay curious! 🌏</p>}

      {data.episode.activities.length > 0 && (
        <section className={`card space-y-3 ${done ? "ring-4 ring-sun" : ""}`}>
          <h2 className="text-center text-2xl font-bold">Let&apos;s do something!</h2>
          <div className="grid grid-cols-3 gap-2">
            {data.episode.activities.map((a, i) => (
              <button
                key={i}
                onClick={() => setActivity(activity === i ? null : i)}
                className={`flex flex-col items-center gap-1 rounded-2xl p-3 text-center transition active:scale-95 ${activity === i ? "bg-sun text-white" : "bg-orange-50"}`}
              >
                <span className="text-4xl">{ACTIVITY_ICON[a.kind] ?? "✨"}</span>
                <span className="font-display text-sm font-semibold leading-tight">{a.title}</span>
              </button>
            ))}
          </div>
          {activity !== null && data.episode.activities[activity] && (
            <ActivityDetail a={data.episode.activities[activity]} />
          )}
        </section>
      )}

      <button className="self-center text-sm font-semibold text-slate-500 underline" onClick={() => setShowWords((s) => !s)}>
        {showWords ? "Hide the words" : "Show the words"}
      </button>
      {showWords && current && <p className="card whitespace-pre-line text-lg">{current.caption}</p>}

      <button className="btn-soft self-center" onClick={() => setGrownUp((g) => !g)}>
        {grownUp ? "Close grown-up notes" : "For grown-ups"}
      </button>
      {grownUp && (
        <section className="card space-y-5">
          {data.episode.grownup_fact && (
            <div className="rounded-2xl bg-sky/15 p-3">
              <h2 className="text-lg font-semibold">Did you know? (for you)</h2>
              <p className="mt-1">{data.episode.grownup_fact}</p>
            </div>
          )}
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

function clock(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

const ACTIVITY_ICON: Record<string, string> = { make: "✂️", move: "🏃", explore: "🔍", draw: "🖍️" };

function ActivityDetail({ a }: { a: Activity }) {
  return (
    <div className="space-y-2 rounded-2xl bg-white p-3 ring-1 ring-orange-100">
      <p className="text-sm text-slate-500">For grown-ups · about {a.minutes} min</p>
      {a.need.length > 0 && (
        <p>
          <span className="font-semibold">You need: </span>
          {a.need.join(", ")}
        </p>
      )}
      <ol className="list-decimal space-y-1 pl-5">
        {a.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      <p className="rounded-xl bg-sky/15 p-2">
        <span className="font-semibold">Ask: </span>
        {a.talk}
      </p>
      {a.safety && <p className="text-sm text-amber-700">⚠️ {a.safety}</p>}
    </div>
  );
}
