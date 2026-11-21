"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ArrowClockwise, ArrowCounterClockwise, ArrowSquareOut, CaretDown, ListPlus, Pause, Play, SkipForward, Stop, Trash, X } from "@phosphor-icons/react";
import { api, supabase } from "@/lib/supabase/browser";

export type Cue = { start: number; end: number; caption: string; kind: string; think?: boolean };
export type Track = { id: string; kid: string | null; title: string; art: string | null; url: string; duration: number; cues: Cue[] };
/** An episode waiting in the queue: just enough to show it; the audio is fetched when its turn comes. */
export type QueueItem = { id: string; kid: string | null; title: string; art: string | null };

type Player = {
  track: Track | null;
  playing: boolean;
  time: number;
  /** Get an episode ready without playing it. Ignored while another episode is loaded. */
  load: (t: Track) => void;
  /** Switch to an episode and play it. */
  start: (t: Track) => void;
  queue: QueueItem[];
  addToQueue: (q: QueueItem) => void;
  removeFromQueue: (id: string, kid: string | null) => void;
  /** Move a queued episode to the front. */
  playNext: (id: string, kid: string | null) => void;
  clearQueue: () => void;
  /** Play the next episode in the queue now. */
  next: () => void;
  play: () => void;
  pause: () => void;
  seek: (s: number) => void;
  /** Pause and go back to the start. */
  stop: () => void;
  /** Stop and put the episode away (hides the mini player). */
  close: () => void;
};

const Ctx = createContext<Player | null>(null);
export const usePlayer = () => useContext(Ctx)!;

/** Remembers where each listener got to, and marks an episode heard at 80% (or the end). */
const lastSync = new Map<string, number>();
function syncListen(t: Track, position: number, ended = false, force = false) {
  const key = `${t.id}:${t.kid ?? "library"}`;
  const now = Date.now();
  if (!ended && !force && now - (lastSync.get(key) ?? 0) < 10000) return;
  lastSync.set(key, now);
  const heard = ended || (t.duration > 0 && position / t.duration >= 0.8);
  supabase()
    .from("listens")
    .upsert(
      { episode_id: t.id, listener: t.kid ?? "library", position: ended ? 0 : Math.floor(position), duration: Math.floor(t.duration), updated_at: new Date().toISOString(), ...(heard ? { heard: true } : {}) },
      { onConflict: "family_id,episode_id,listener" },
    )
    .then(({ error }) => error && console.warn("listen sync", error.message));
}

const QUEUE_KEY = "woe:queue";
const posKey = (t: Pick<Track, "id" | "kid">) => `woe:pos:${t.id}:${t.kid ?? "-"}`;
export function savedPosition(id: string, kid: string | null) {
  try {
    return Number(localStorage.getItem(posKey({ id, kid })) ?? 0) || 0;
  } catch {
    return 0;
  }
}

/** One audio element for the whole app, so episodes keep playing across pages and with the screen off. */
export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [track, setTrack] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const lastSave = useRef(0);
  const switching = useRef(false);
  const [queue, setQueue] = useState<QueueItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as QueueItem[];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch {}
  }, [queue]);

  // Switches the audio element to a track (used for both getting ready and playing).
  // The loaded track, readable inside callbacks without waiting for a render.
  const current = useRef<Track | null>(null);
  useEffect(() => {
    current.current = track;
  }, [track]);

  const swap = useCallback((t: Track) => {
    const a = audio.current;
    if (!a) return;
    const cur = current.current;
    if (cur && cur.id === t.id && cur.kid === t.kid) {
      // Same episode: keep playing; just refresh the (signed) URL if it isn't playing.
      if (a.paused && a.src !== t.url) {
        const at = a.currentTime;
        a.src = t.url;
        a.currentTime = at;
      }
      const next = { ...t, url: a.src };
      current.current = next;
      setTrack(next);
      return;
    }
    if (cur && a.src) {
      // Leaving an episode part-way: remember exactly where, before the audio switches
      // (otherwise the switch reads as "paused at 0" and wipes the spot).
      const at = a.currentTime;
      if (!a.ended && at > 3 && at < cur.duration - 8) {
        try {
          localStorage.setItem(posKey(cur), String(Math.floor(at)));
        } catch {}
        syncListen(cur, at, false, true);
      }
      switching.current = !a.paused;
      lastSave.current = 0;
    }
    a.src = t.url;
    const pos = savedPosition(t.id, t.kid);
    if (pos > 3 && pos < t.duration - 8) a.currentTime = pos;
    setTime(pos > 3 && pos < t.duration - 8 ? pos : 0);
    current.current = t;
    setTrack(t);
  }, []);

  const load = useCallback(
    (t: Track) => {
      const a = audio.current;
      if (!a) return;
      // Opening another episode must never take over the one that's loaded (playing or paused).
      // It switches only when you press play on it.
      const cur = current.current;
      if (cur && (cur.id !== t.id || cur.kid !== t.kid)) return;
      swap(t);
    },
    [swap],
  );

  const start = useCallback(
    (t: Track) => {
      swap(t);
      setQueue((q) => q.filter((x) => !(x.id === t.id && x.kid === t.kid)));
      // Play straight from the tap (phones only allow audio to start from a tap).
      const a = audio.current;
      if (!a) return;
      if (a.ended) a.currentTime = 0;
      a.play().catch(() => setPlaying(false));
    },
    [swap],
  );

  const addToQueue = useCallback((item: QueueItem) => {
    setQueue((q) => (q.some((x) => x.id === item.id && x.kid === item.kid) ? q : [...q, item]));
  }, []);
  const removeFromQueue = useCallback((id: string, kid: string | null) => {
    setQueue((q) => q.filter((x) => !(x.id === id && x.kid === kid)));
  }, []);

  const playNext = useCallback((id: string, kid: string | null) => {
    setQueue((q) => {
      const item = q.find((x) => x.id === id && x.kid === kid);
      return item ? [item, ...q.filter((x) => x !== item)] : q;
    });
  }, []);
  const clearQueue = useCallback(() => setQueue([]), []);

  const next = useCallback(async () => {
    const item = queue[0];
    if (!item) return;
    try {
      const d = await api<{ episode: { title: string; art_url: string | null }; audio: { url: string; duration: number; cues: Cue[] } }>(
        `/api/episodes/${item.id}/play${item.kid ? `?kid=${item.kid}` : ""}`,
      );
      start({ id: item.id, kid: item.kid, title: d.episode.title, art: d.episode.art_url, url: d.audio.url, duration: d.audio.duration, cues: d.audio.cues });
    } catch {
      // Couldn't load it: drop it so the queue doesn't get stuck.
      setQueue((q) => q.slice(1));
    }
  }, [queue, start]);

  const play = useCallback(() => {
    const a = audio.current;
    if (!a) return;
    if (a.ended) a.currentTime = 0;
    a.play().catch(() => setPlaying(false));
  }, []);
  const pause = useCallback(() => audio.current?.pause(), []);
  const seek = useCallback((s: number) => {
    const a = audio.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(s, (a.duration || s) - 0.1));
    setTime(a.currentTime);
  }, []);

  const stop = useCallback(() => {
    const a = audio.current;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
    setTime(0);
    lastSave.current = 0;
    setTrack((t) => {
      if (t) {
        try {
          localStorage.removeItem(posKey(t));
        } catch {}
        syncListen(t, 0, false, true);
      }
      return t;
    });
  }, []);
  const close = useCallback(() => {
    stop();
    const a = audio.current;
    current.current = null;
    setTrack(null);
    if (a) {
      a.removeAttribute("src");
      a.load();
    }
  }, [stop]);

  // Lock screen / headphone controls.
  useEffect(() => {
    if (!track || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: "Otto & Cheko",
      album: "WOE! What On Earth?",
      artwork: track.art ? [{ src: track.art, sizes: "512x512", type: "image/png" }] : [{ src: "/icon-512.png", sizes: "512x512" }],
    });
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", play);
    ms.setActionHandler("pause", pause);
    ms.setActionHandler("seekbackward", (d) => seek((audio.current?.currentTime ?? 0) - (d.seekOffset ?? 15)));
    ms.setActionHandler("seekforward", (d) => seek((audio.current?.currentTime ?? 0) + (d.seekOffset ?? 15)));
    try {
      ms.setActionHandler("stop", stop);
    } catch {}
    try {
      ms.setActionHandler("seekto", (d) => d.seekTime != null && seek(d.seekTime));
    } catch {}
    try {
      ms.setActionHandler("nexttrack", queue.length ? next : null);
    } catch {}
  }, [track, play, pause, seek, stop, queue.length, next]);

  function onTime() {
    const a = audio.current;
    if (!a || !track) return;
    setTime(a.currentTime);
    if (!a.paused) syncListen(track, a.currentTime);
    if (Math.abs(a.currentTime - lastSave.current) > 3) {
      lastSave.current = a.currentTime;
      try {
        localStorage.setItem(posKey(track), String(Math.floor(a.currentTime)));
      } catch {}
    }
  }
  function onEnded() {
    setPlaying(false);
    if (track) syncListen(track, track.duration, true);
    if (track)
      try {
        localStorage.removeItem(posKey(track));
      } catch {}
    // Straight on to the next one in the queue.
    if (queue.length) next();
  }

  return (
    <Ctx.Provider value={{ track, playing, time, load, start, queue, addToQueue, removeFromQueue, playNext, clearQueue, next, play, pause, seek, stop, close }}>
      {children}
      <MiniPlayer />
      <audio
        ref={audio}
        preload="auto"
        onTimeUpdate={onTime}
        onPlay={() => {
          switching.current = false;
          setPlaying(true);
        }}
        onPause={() => {
          setPlaying(false);
          // A pause caused by switching episodes was already saved with the right spot.
          if (switching.current) {
            switching.current = false;
            return;
          }
          const a = audio.current;
          if (track && a && !a.ended) syncListen(track, a.currentTime, false, true);
        }}
        onEnded={onEnded}
      />
    </Ctx.Provider>
  );
}

function clock(sec: number) {
  const m = Math.floor(sec / 60);
  return `${m}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

function MiniPlayer() {
  const p = useContext(Ctx)!;
  const path = usePathname();
  const [open, setOpen] = useState(false);
  // Hidden only on the page of the episode that's playing (that page is the full player).
  const show = Boolean(p.track) && !path.startsWith(`/e/${p.track?.id}`);
  // Leave room at the bottom of the page so the bar never covers buttons.
  useEffect(() => {
    document.documentElement.classList.toggle("has-mini-player", show);
    return () => document.documentElement.classList.remove("has-mini-player");
  }, [show]);
  if (!p.track || !show) return null;
  const pct = p.track.duration ? (p.time / p.track.duration) * 100 : 0;
  return (
    <>
      <div
        style={{ bottom: "calc(var(--nav-h) + 0.5rem + env(safe-area-inset-bottom))" }}
        className="pop-in fixed inset-x-3 z-50 mx-auto max-w-xl overflow-hidden rounded-2xl bg-white/95 shadow-[0_8px_28px_rgba(0,0,0,.14)] ring-1 ring-black/5 backdrop-blur"
      >
        <div className="flex items-center gap-3 p-2 pr-3">
          <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setOpen(true)} aria-label="Open now playing">
            {p.track.art ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.track.art} alt="" className="h-11 w-11 rounded-xl object-cover" />
            ) : (
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-sky-wash text-xl">🌏</span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold">{p.track.title}</span>
              <span className="flex items-center gap-1.5 truncate text-xs font-semibold text-slate-500">
                {p.playing && (
                  <span className="eq flex h-3 items-end gap-[2px] text-ember" aria-hidden>
                    <span className="h-3" /><span className="h-3" /><span className="h-3" />
                  </span>
                )}
                {p.queue.length ? `Up next: ${p.queue[0].title}` : "Otto & Cheko"}
              </span>
            </span>
          </button>
          <button
            className="press grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ember text-white"
            onClick={p.playing ? p.pause : p.play}
            aria-label={p.playing ? "Pause" : "Play"}
          >
            {p.playing ? <Pause size={18} weight="fill" /> : <Play size={18} weight="fill" className="translate-x-px" />}
          </button>
          {p.queue.length > 0 ? (
            <button className="press grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink" onClick={p.next} aria-label="Play next in queue">
              <SkipForward size={18} weight="fill" />
            </button>
          ) : (
            <button className="press grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-400" onClick={p.close} aria-label="Stop">
              <X size={18} weight="bold" />
            </button>
          )}
        </div>
        <div className="absolute inset-x-3 bottom-0 h-[3px] overflow-hidden rounded-full bg-orange-100">
          <div className="h-full rounded-full bg-ember transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {open && <NowPlaying onClose={() => setOpen(false)} />}
    </>
  );
}

/** The mini player opened up: big cover, controls, what's up next, and a few options. Swipe down to close. */
function NowPlaying({ onClose }: { onClose: () => void }) {
  const p = useContext(Ctx)!;
  const [dy, setDy] = useState(0);
  const startY = useRef<number | null>(null);
  const t = p.track;
  if (!t) return null;
  const href = `/e/${t.id}${t.kid ? `?kid=${t.kid}` : ""}`;
  const pct = t.duration ? Math.min(100, (p.time / t.duration) * 100) : 0;
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/30" role="dialog" aria-label="Now playing" onClick={onClose}>
      <div
        className="sheet-up mt-auto flex max-h-[94dvh] w-full flex-col overflow-y-auto rounded-t-[2rem] bg-cream shadow-2xl sm:mx-auto sm:max-w-xl"
        style={{ transform: dy ? `translateY(${dy}px)` : undefined, paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => {
          if (e.currentTarget.scrollTop <= 0) startY.current = e.touches[0].clientY;
        }}
        onTouchMove={(e) => {
          if (startY.current === null) return;
          setDy(Math.max(0, e.touches[0].clientY - startY.current));
        }}
        onTouchEnd={() => {
          startY.current = null;
          if (dy > 90) onClose();
          else setDy(0);
        }}
      >
        <div className="flex items-center justify-between px-4 pt-3">
          <button className="press grid h-11 w-11 place-items-center rounded-full" onClick={onClose} aria-label="Close">
            <CaretDown size={24} weight="bold" />
          </button>
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Now playing</span>
          <span className="h-11 w-11" aria-hidden />
        </div>

        <div className="px-6">
          <div className="mx-auto mt-2 aspect-square w-full max-w-sm overflow-hidden rounded-3xl bg-sky-wash shadow-lg">
            {t.art ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.art} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full place-items-center text-7xl">🌏</div>
            )}
          </div>
          <h2 className="mt-5 text-xl font-bold leading-tight">{t.title}</h2>
          <p className="text-sm font-semibold text-slate-500">Otto &amp; Cheko</p>

          <input
            type="range"
            min={0}
            max={Math.max(1, Math.floor(t.duration))}
            step={1}
            value={Math.floor(p.time)}
            onChange={(e) => p.seek(Number(e.target.value))}
            className="scrub mt-4 w-full"
            style={{ ["--pct" as string]: `${pct}%` }}
            aria-label="Where you are in the episode"
          />
          <div className="flex justify-between text-xs font-bold tabular-nums text-slate-500">
            <span>{clock(p.time)}</span>
            <span>-{clock(Math.max(0, t.duration - p.time))}</span>
          </div>

          <div className="mt-2 flex items-center justify-center gap-5">
            <button className="press grid h-11 w-11 place-items-center text-slate-400" onClick={p.stop} aria-label="Stop">
              <Stop size={26} weight="fill" />
            </button>
            <button className="press grid h-12 w-12 place-items-center" onClick={() => p.seek(p.time - 15)} aria-label="Back 15 seconds">
              <ArrowCounterClockwise size={40} weight="bold" />
            </button>
            <button
              className="press grid h-[72px] w-[72px] place-items-center rounded-full bg-ember text-white shadow-[0_5px_0_#b5541f]"
              onClick={p.playing ? p.pause : p.play}
              aria-label={p.playing ? "Pause" : "Play"}
            >
              {p.playing ? <Pause size={34} weight="fill" /> : <Play size={34} weight="fill" className="translate-x-0.5" />}
            </button>
            <button className="press grid h-12 w-12 place-items-center" onClick={() => p.seek(p.time + 15)} aria-label="Forward 15 seconds">
              <ArrowClockwise size={40} weight="bold" />
            </button>
            <button
              className="press grid h-11 w-11 place-items-center disabled:opacity-30"
              onClick={p.next}
              disabled={!p.queue.length}
              aria-label="Play next in queue"
            >
              <SkipForward size={26} weight="fill" />
            </button>
          </div>

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link href={href} onClick={onClose} className="btn-soft py-2 text-sm">
              <ArrowSquareOut size={18} weight="bold" /> Open episode
            </Link>
            <button
              className="btn-soft py-2 text-sm"
              onClick={() => {
                p.close();
                onClose();
              }}
            >
              <X size={18} weight="bold" /> Stop and close
            </button>
          </div>

          <section className="mt-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Up next</h3>
              {p.queue.length > 1 && (
                <button className="flex items-center gap-1 text-sm font-semibold text-slate-500" onClick={p.clearQueue}>
                  <Trash size={16} weight="bold" /> Clear
                </button>
              )}
            </div>
            {p.queue.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">
                <ListPlus size={16} weight="bold" className="mr-1 inline -translate-y-px" />
                Nothing yet. Tap the queue button on any episode to add it.
              </p>
            ) : (
              <ol className="mt-2 space-y-2">
                {p.queue.map((q, i) => (
                  <li key={`${q.id}:${q.kid}`} className="flex items-center gap-3 rounded-2xl bg-white p-2 ring-1 ring-orange-100">
                    {q.art ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={q.art} alt="" className="h-11 w-11 rounded-xl object-cover" />
                    ) : (
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-sky-wash">🌏</span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-bold">{q.title}</span>
                    {i > 0 && (
                      <button className="press rounded-full px-2 py-1 text-xs font-bold text-sky-700" onClick={() => p.playNext(q.id, q.kid)}>
                        Play next
                      </button>
                    )}
                    <button
                      className="press grid h-8 w-8 place-items-center rounded-full text-slate-400"
                      onClick={() => p.removeFromQueue(q.id, q.kid)}
                      aria-label={`Remove ${q.title} from the queue`}
                    >
                      <X size={16} weight="bold" />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
