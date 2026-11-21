"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import { useFamily, useSession } from "@/lib/hooks";
import { loadBrowse, tileEpisodes, tilesFor, type BrowseEpisode } from "@/lib/browse";
import { EpisodeCard } from "@/components/EpisodeCard";

/** One browse tile opened up: its colour across the top, then every episode in it. */
export default function TilePage() {
  const { tile: tileId } = useParams<{ tile: string }>();
  const { session } = useSession();
  const { kids, loading } = useFamily(Boolean(session));
  const [all, setAll] = useState<BrowseEpisode[] | null>(null);

  useEffect(() => {
    if (!session) return;
    loadBrowse().then(setAll);
  }, [session]);

  const tile = useMemo(() => tilesFor(kids).find((t) => t.id === tileId), [kids, tileId]);
  const eps = useMemo(() => (tile && all ? tileEpisodes(tile, all) : null), [tile, all]);
  // A kid's own shelf plays with their personal hello.
  const listener = tileId.startsWith("kid-") ? tileId.slice(4) : "all";

  if (!tile && !loading) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-xl">That shelf isn&apos;t here.</p>
        <Link className="btn-soft" href="/search">Back to search</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col">
      <header
        className="px-6 pb-8 text-white"
        style={{ background: `linear-gradient(180deg, ${tile?.colour ?? "#38bdf8"}, ${tile?.colour ?? "#38bdf8"}cc)`, paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
      >
        <Link href="/search" className="press grid h-11 w-11 place-items-center rounded-full bg-white/20" aria-label="Back to search">
          <ArrowLeft size={20} weight="bold" />
        </Link>
        <p className="mt-4 text-4xl" aria-hidden>{tile?.emoji}</p>
        <h1 className="mt-1 text-3xl font-black leading-tight">{tile?.label}</h1>
        <p className="mt-1 text-sm font-semibold opacity-90">{tile?.blurb}</p>
      </header>

      <section className="flex-1 p-6">
        {eps === null ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3" aria-busy>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton aspect-[4/5] rounded-3xl" />
            ))}
          </div>
        ) : eps.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-slate-500">
            <p className="text-lg">Nothing here yet.</p>
            <Link className="btn-primary" href="/kid/all">Ask Otto something</Link>
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm font-semibold text-slate-500">
              {eps.length} episode{eps.length === 1 ? "" : "s"}
            </p>
            <div className="stagger grid grid-cols-2 gap-4 sm:grid-cols-3">
              {eps.map((e) => (
                <EpisodeCard key={e.id} episode={e} href={`/e/${e.id}?kid=${listener}`} />
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
