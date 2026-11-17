"use client";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api, supabase } from "@/lib/supabase/browser";
import { useSession } from "@/lib/hooks";
import { Cheko, Otto } from "@/components/Characters";
import { CATEGORIES, type Activity, type ClaimCheck } from "@/lib/types";
import { usePlayer, type Cue } from "@/components/PlayerProvider";
import { ArrowClockwise, ArrowCounterClockwise, ArrowLeft, CheckCircle, Circle, MagnifyingGlass, Pause, Play, Stop, Star } from "@phosphor-icons/react";

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
    follow_ups: string[];
    parent: { id: string; title: string } | null;
    children: { id: string; title: string }[];
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
  const [heardSaved, setHeard] = useState(false);
  const [activity, setActivity] = useState<number | null>(null);
  const player = usePlayer();
  const [peek, setPeek] = useState(false);
  const [touchY, setTouchY] = useState<number | null>(null);

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
    supabase()
      .from("listens")
      .select("heard")
      .eq("episode_id", id)
      .eq("heard", true)
      .limit(1)
      .then(({ data }) => setHeard(Boolean(data?.length)));
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
  // Playing past 80% (or to the end) marks it heard automatically, like the sync does.
  const heard = heardSaved || done || (mine && duration > 0 && time / duration >= 0.8);
  const playing = mine && player.playing;

  function toggle() {
    if (playing) player.pause();
    else player.play();
  }
  function skip(seconds: number) {
    if (mine) player.seek(time + seconds);
  }

  async function toggleHeard() {
    const next = !heard;
    setHeard(next);
    if (next) {
      await supabase()
        .from("listens")
        .upsert(
          { episode_id: id, listener: kid ?? "library", heard: true, duration: Math.floor(duration), updated_at: new Date().toISOString() },
          { onConflict: "family_id,episode_id,listener" },
        );
    } else {
      // Not heard for anyone in the family, so it shows up as new again.
      await supabase().from("listens").update({ heard: false }).eq("episode_id", id);
    }
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

  const pct = duration ? Math.min(100, (time / duration) * 100) : 0;
  const onTouchStart = (e: React.TouchEvent) => setTouchY(e.touches[0].clientY);
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchY === null) return;
    const dy = e.changedTouches[0].clientY - touchY;
    if (dy > 40) setPeek(true);
    if (dy < -40) setPeek(false);
    setTouchY(null);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col bg-cream">
      {/* Full-bleed cover art. Pull the sheet down to see all of it (find Cheko!). */}
      <div
        className="relative overflow-hidden transition-[height] duration-500 ease-out"
        style={{ height: peek ? "84dvh" : "52dvh", background: cat?.colour ?? "#38bdf8" }}
        onClick={() => peek && setPeek(false)}
      >
        {data.episode.art_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.episode.art_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-8xl">{cat?.emoji ?? "🌏"}</div>
        )}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}>
          <Link href={kid ? `/kid/${kid}` : "/library"} className="press grid h-11 w-11 place-items-center rounded-full bg-white/90 shadow" aria-label="Back">
            <ArrowLeft size={20} weight="bold" />
          </Link>
          <div className="flex items-center gap-2">
            <Otto size={44} />
            <div className={playing ? "bob" : ""}><Cheko form={data.episode.cheko_form} size={44} /></div>
            <button onClick={(e) => { e.stopPropagation(); toggleFav(); }} className="press grid h-11 w-11 place-items-center rounded-full bg-white/90 shadow" aria-label={fav ? "Remove favourite" : "Favourite"}>
              <Star size={22} weight={fav ? "fill" : "regular"} className={fav ? "celebrate text-amber-400" : ""} />
            </button>
          </div>
        </div>
        {peek && (
          <p className="pop-in absolute inset-x-0 bottom-12 mx-auto w-fit rounded-full bg-white/90 px-4 py-2 text-sm font-bold shadow">
            <MagnifyingGlass className="mr-1 inline" weight="bold" /> Can you find Cheko?
          </p>
        )}
      </div>

      <section className="relative -mt-8 flex flex-1 flex-col gap-5 rounded-t-[2rem] border-t-[6px] border-ember bg-cream px-6 pb-6 pt-2" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <button className="mx-auto flex h-6 w-16 items-center justify-center" onClick={() => setPeek((v) => !v)} aria-label={peek ? "Show the player" : "See the whole picture"}>
          <span className="h-1.5 w-10 rounded-full bg-ink/25" />
        </button>

        <div className="text-center">
          <h1 className="text-2xl font-bold leading-tight">{data.episode.title}</h1>
          {cat && <p className="mt-1 text-sm font-semibold text-slate-500">{cat.emoji} {cat.label}</p>}
        </div>

        <div className="space-y-1">
          <input
            type="range"
            min={0}
            max={Math.max(1, Math.floor(duration))}
            step={1}
            value={Math.floor(time)}
            onChange={(e) => player.seek(Number(e.target.value))}
            className="scrub w-full"
            style={{ ["--pct" as string]: `${pct}%` }}
            aria-label="Where you are in the episode"
          />
          <div className="flex justify-between text-xs font-bold tabular-nums text-slate-500">
            <span>{clock(time)}</span>
            <span>-{clock(Math.max(0, duration - time))}</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-6">
          <button className="press grid h-11 w-11 place-items-center text-slate-400" onClick={player.stop} disabled={!mine} aria-label="Stop">
            <Stop size={26} weight="fill" />
          </button>
          <SkipButton seconds={-15} onClick={() => skip(-15)} />
          <button className="press grid h-[72px] w-[72px] place-items-center rounded-full bg-ember text-white shadow-[0_5px_0_#b5541f] active:shadow-[0_2px_0_#b5541f]" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause size={34} weight="fill" /> : <Play size={34} weight="fill" className="translate-x-0.5" />}
          </button>
          <SkipButton seconds={15} onClick={() => skip(15)} />
          <span className="h-11 w-11" aria-hidden />
        </div>

        <button
          onClick={toggleHeard}
          className={`press flex items-center gap-1.5 self-center rounded-full px-3 py-1 text-sm font-bold ${heard ? "bg-green-50 text-leaf" : "text-slate-500"}`}
        >
          {heard ? <CheckCircle size={18} weight="fill" /> : <Circle size={18} weight="bold" />}
          {heard ? "Heard" : "Mark as heard"}
        </button>

      {think && (
        <button className="text-center font-display text-2xl" onClick={() => player.seek(think.end)}>
          🤔 What do you think? <span className="text-base text-slate-500 underline">skip</span>
        </button>
      )}
      {done && <p className="celebrate text-center font-display text-xl font-bold">Keep wondering! 🌏</p>}

      <section className="card space-y-3">
        <h2 className="text-xl font-semibold">Wonder more 🎩</h2>
        {data.episode.follow_ups.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {data.episode.follow_ups.map((q) => (
              <Link key={q} href={`/kid/${kid ?? "all"}?follow=${id}&q=${encodeURIComponent(q)}`} className="btn-soft px-4 py-2 text-left text-base">
                {q}
              </Link>
            ))}
          </div>
        )}
        <Link href={`/kid/${kid ?? "all"}?follow=${id}`} className="btn-primary flex items-center justify-center gap-2 py-3">
          🎤 Ask more about this
        </Link>
        {(data.episode.parent || data.episode.children.length > 0) && (
          <div className="space-y-1 pt-1 text-sm">
            {data.episode.parent && (
              <p>
                <span className="text-slate-500">Before this: </span>
                <Link className="font-semibold underline" href={`/e/${data.episode.parent.id}${kid ? `?kid=${kid}` : ""}`}>{data.episode.parent.title}</Link>
              </p>
            )}
            {data.episode.children.map((c) => (
              <p key={c.id}>
                <span className="text-slate-500">Next: </span>
                <Link className="font-semibold underline" href={`/e/${c.id}${kid ? `?kid=${kid}` : ""}`}>{c.title}</Link>
              </p>
            ))}
          </div>
        )}
      </section>

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
      </section>
    </main>
  );
}

function SkipButton({ seconds, onClick }: { seconds: number; onClick: () => void }) {
  const Icon = seconds < 0 ? ArrowCounterClockwise : ArrowClockwise;
  return (
    <button className="press relative grid h-12 w-12 place-items-center text-ink" onClick={onClick} aria-label={seconds < 0 ? "Back 15 seconds" : "Forward 15 seconds"}>
      <Icon size={44} weight="bold" />
      <span className="absolute inset-0 grid place-items-center pt-0.5 text-[11px] font-black tabular-nums">{Math.abs(seconds)}</span>
    </button>
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
