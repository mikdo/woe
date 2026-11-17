"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Pause, Play, X } from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase/browser";

export type Cue = { start: number; end: number; caption: string; kind: string; think?: boolean };
export type Track = { id: string; kid: string | null; title: string; art: string | null; url: string; duration: number; cues: Cue[] };

type Player = {
  track: Track | null;
  playing: boolean;
  time: number;
  load: (t: Track) => void;
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

  const load = useCallback((t: Track) => {
    const a = audio.current;
    if (!a) return;
    setTrack((cur) => {
      if (cur && cur.id === t.id && cur.kid === t.kid) {
        // Same episode: keep playing; just refresh the (signed) URL if it isn't playing.
        if (a.paused && a.src !== t.url) {
          const at = a.currentTime;
          a.src = t.url;
          a.currentTime = at;
        }
        return { ...t, url: a.src };
      }
      a.src = t.url;
      const pos = savedPosition(t.id, t.kid);
      if (pos > 3 && pos < t.duration - 8) a.currentTime = pos;
      setTime(pos > 3 && pos < t.duration - 8 ? pos : 0);
      return t;
    });
  }, []);

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
  }, [track, play, pause, seek, stop]);

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
  }

  return (
    <Ctx.Provider value={{ track, playing, time, load, play, pause, seek, stop, close }}>
      {children}
      <MiniPlayer />
      <audio
        ref={audio}
        preload="auto"
        onTimeUpdate={onTime}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          const a = audio.current;
          if (track && a && !a.ended) syncListen(track, a.currentTime, false, true);
        }}
        onEnded={onEnded}
      />
    </Ctx.Provider>
  );
}

function MiniPlayer() {
  const p = useContext(Ctx)!;
  const path = usePathname();
  const show = Boolean(p.track) && !path.startsWith("/e/");
  // Leave room at the bottom of the page so the bar never covers buttons.
  useEffect(() => {
    document.documentElement.classList.toggle("has-mini-player", show);
    return () => document.documentElement.classList.remove("has-mini-player");
  }, [show]);
  if (!p.track || !show) return null;
  const href = `/e/${p.track.id}${p.track.kid ? `?kid=${p.track.kid}` : ""}`;
  const pct = p.track.duration ? (p.time / p.track.duration) * 100 : 0;
  return (
    <div
      style={{ bottom: "calc(var(--nav-h) + 0.5rem + env(safe-area-inset-bottom))" }}
      className="pop-in fixed inset-x-3 z-50 mx-auto max-w-xl overflow-hidden rounded-2xl bg-white/95 shadow-[0_8px_28px_rgba(0,0,0,.14)] ring-1 ring-black/5 backdrop-blur"
    >
      <div className="flex items-center gap-3 p-2 pr-3">
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-3">
          {p.track.art ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.track.art} alt="" className="h-11 w-11 rounded-xl object-cover" />
          ) : (
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-sky-wash text-xl">🌏</span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold">{p.track.title}</span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              {p.playing && (
                <span className="eq flex h-3 items-end gap-[2px] text-ember" aria-hidden>
                  <span className="h-3" /><span className="h-3" /><span className="h-3" />
                </span>
              )}
              Otto &amp; Cheko
            </span>
          </span>
        </Link>
        <button
          className="press grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ember text-white"
          onClick={p.playing ? p.pause : p.play}
          aria-label={p.playing ? "Pause" : "Play"}
        >
          {p.playing ? <Pause size={18} weight="fill" /> : <Play size={18} weight="fill" className="translate-x-px" />}
        </button>
        <button className="press grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-400" onClick={p.close} aria-label="Stop">
          <X size={18} weight="bold" />
        </button>
      </div>
      <div className="absolute inset-x-3 bottom-0 h-[3px] overflow-hidden rounded-full bg-orange-100">
        <div className="h-full rounded-full bg-ember transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
