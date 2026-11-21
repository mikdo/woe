"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase/browser";
import { useFamily, useSession } from "@/lib/hooks";
import { loadBrowse, tileEpisodes, tilesFor, type BrowseEpisode } from "@/lib/browse";
import { BrowseTile } from "@/components/BrowseTile";
import { artUrl } from "@/components/EpisodeCard";
import { CATEGORIES } from "@/lib/types";

type Hit = {
  id: string;
  title: string | null;
  question: string;
  category: string | null;
  art_path: string | null;
  bedtime: boolean;
  kind: string;
  snippet: string | null;
};

/** "...why do **crocodiles** snap? [excited] Ooh..." -> text with the matched words in bold, audio tags removed. */
function Snippet({ text }: { text: string }) {
  const clean = text.replace(/\[[^\]]+\]\s*/g, "");
  return (
    <>
      {clean.split("**").map((part, i) => (i % 2 ? <b key={i} className="text-ink">{part}</b> : <span key={i}>{part}</span>))}
    </>
  );
}

export default function SearchPage() {
  const { session } = useSession();
  const { kids } = useFamily(Boolean(session));
  const [all, setAll] = useState<BrowseEpisode[] | null>(null);
  const [q, setQ] = useState("");
  // Results remember which words they're for, so stale ones never show.
  const [result, setResult] = useState<{ term: string; hits: Hit[] } | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!session) return;
    loadBrowse().then(setAll);
  }, [session]);

  // Search as you type, after a short pause.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const n = ++seq.current;
    const t = setTimeout(async () => {
      const { data } = await supabase().rpc("search_episodes", { q: term });
      if (n !== seq.current) return;
      setResult({ term, hits: (data ?? []) as Hit[] });
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const tiles = useMemo(() => {
    const list = all ?? [];
    return tilesFor(kids)
      .map((t) => ({ tile: t, eps: tileEpisodes(t, list) }))
      .filter(({ tile, eps }) => eps.length > 0 || tile.id === "latest");
  }, [all, kids]);

  const term = q.trim();
  const hits = result && result.term === term ? result.hits : null;
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-5 p-6" style={{ paddingTop: "calc(env(safe-area-inset-top) + 20px)" }}>
      <h1 className="text-3xl font-black">Search</h1>

      <label className="sticky top-2 z-20 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_3px_0_#f1e4cc] ring-1 ring-orange-100">
        <MagnifyingGlass size={22} weight="bold" className="shrink-0 text-slate-500" />
        <input
          className="min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-slate-400"
          placeholder="What do you want to wonder about?"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          enterKeyHint="search"
          autoCorrect="off"
          aria-label="Search episodes"
        />
        {q && (
          <button className="press grid h-8 w-8 place-items-center rounded-full text-slate-400" onClick={() => setQ("")} aria-label="Clear search">
            <X size={18} weight="bold" />
          </button>
        )}
      </label>

      {term.length >= 2 ? (
        <section className="space-y-3" aria-live="polite">
          {hits === null ? (
            <p className="text-sm text-slate-500">Looking…</p>
          ) : hits.length === 0 ? (
            <p className="text-slate-500">No episode about &ldquo;{term}&rdquo; yet.</p>
          ) : (
            <ul className="space-y-2">
              {hits.map((h) => {
                const cat = CATEGORIES.find((c) => c.id === h.category);
                const src = artUrl(h.art_path);
                return (
                  <li key={h.id}>
                    <Link href={`/e/${h.id}?kid=all`} className="press flex items-center gap-3 rounded-2xl bg-white p-2 ring-1 ring-orange-100">
                      <span className="h-16 w-16 shrink-0 overflow-hidden rounded-xl" style={{ background: cat?.colour ?? "#38bdf8" }}>
                        {src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <span className="grid h-full place-items-center text-3xl">{cat?.emoji ?? "🌏"}</span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-sm font-semibold">
                          {h.kind === "journey" ? "🧭 " : ""}
                          {h.bedtime ? "🌙 " : ""}
                          {h.title ?? h.question}
                        </span>
                        {h.snippet && (
                          <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500">
                            …<Snippet text={h.snippet} />…
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <Link href={`/kid/all?ask=${encodeURIComponent(term)}`} className="btn-primary w-full">
            {hits && hits.length > 0 ? "Not quite it? Ask Otto" : "Ask Otto about it"}
          </Link>
        </section>
      ) : (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">Browse all</h2>
          {all === null ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="skeleton aspect-[16/10] rounded-2xl" />
              ))}
            </div>
          ) : (
            <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3">
              {tiles.map(({ tile, eps }) => (
                <BrowseTile
                  key={tile.id}
                  href={`/search/${tile.id}`}
                  label={tile.label}
                  colour={tile.colour}
                  emoji={tile.emoji}
                  art={eps.find((e) => e.art_path)?.art_path ?? null}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
