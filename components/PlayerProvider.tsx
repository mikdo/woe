"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

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
};

const Ctx = createContext<Player | null>(null);
export const usePlayer = () => useContext(Ctx)!;

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
    ms.setActionHandler("seekbackward", () => seek((audio.current?.currentTime ?? 0) - 10));
    ms.setActionHandler("seekforward", () => seek((audio.current?.currentTime ?? 0) + 10));
    try {
      ms.setActionHandler("seekto", (d) => d.seekTime != null && seek(d.seekTime));
    } catch {}
  }, [track, play, pause, seek]);

  function onTime() {
    const a = audio.current;
    if (!a || !track) return;
    setTime(a.currentTime);
    if (Math.abs(a.currentTime - lastSave.current) > 3) {
      lastSave.current = a.currentTime;
      try {
        localStorage.setItem(posKey(track), String(Math.floor(a.currentTime)));
      } catch {}
    }
  }
  function onEnded() {
    setPlaying(false);
    if (track)
      try {
        localStorage.removeItem(posKey(track));
      } catch {}
  }

  return (
    <Ctx.Provider value={{ track, playing, time, load, play, pause, seek }}>
      {children}
      <MiniPlayer />
      <audio
        ref={audio}
        preload="auto"
        onTimeUpdate={onTime}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={onEnded}
      />
    </Ctx.Provider>
  );
}

function MiniPlayer() {
  const p = useContext(Ctx)!;
  const path = usePathname();
  if (!p.track || path.startsWith("/e/")) return null;
  const href = `/e/${p.track.id}${p.track.kid ? `?kid=${p.track.kid}` : ""}`;
  const pct = p.track.duration ? (p.time / p.track.duration) * 100 : 0;
  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl overflow-hidden rounded-3xl bg-white shadow-[0_6px_24px_rgba(0,0,0,.15)]">
      <div className="h-1 bg-sun" style={{ width: `${pct}%` }} />
      <div className="flex items-center gap-3 p-2 pr-3">
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-3">
          {p.track.art ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.track.art} alt="" className="h-12 w-12 rounded-2xl object-cover" />
          ) : (
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sky/20 text-2xl">🌏</span>
          )}
          <span className="truncate font-display text-lg font-semibold">{p.track.title}</span>
        </Link>
        <button className="btn-primary h-12 w-12 rounded-full p-0 text-xl" onClick={p.playing ? p.pause : p.play} aria-label={p.playing ? "Pause" : "Play"}>
          {p.playing ? "⏸" : "▶"}
        </button>
      </div>
    </div>
  );
}
