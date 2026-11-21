import Link from "next/link";
import { CheckCircle, MoonStars, Star } from "@phosphor-icons/react";
import { BANDS, CATEGORIES } from "@/lib/types";

export type EpisodeLite = {
  id: string;
  title: string | null;
  question: string;
  category: string | null;
  art_path: string | null;
  cheko_form: string | null;
  status: string;
  band?: string | null;
  bedtime?: boolean | null;
  favourite?: boolean;
  /** Listened to by anyone in the family. */
  heard?: boolean;
  /** 0..1 for a part-played episode. */
  progress?: number;
};

export function artUrl(path: string | null) {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/shared/${path}`;
}

export function EpisodeCard({ episode, href }: { episode: EpisodeLite; href: string }) {
  const cat = CATEGORIES.find((c) => c.id === episode.category);
  const art = artUrl(episode.art_path);
  return (
    <Link href={href} className="press group overflow-hidden rounded-3xl bg-white shadow-[0_4px_0_#f1e4cc] ring-1 ring-orange-100">
      <div className="relative aspect-square" style={{ background: cat?.colour ?? "#38bdf8" }}>
        {art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={art} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="grid h-full place-items-center text-6xl">{cat?.emoji ?? "🌏"}</div>
        )}
        {episode.favourite && (
          <span className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-amber-400 shadow">
            <Star size={18} weight="fill" />
          </span>
        )}
        {episode.bedtime && (
          <span
            className={`absolute right-2 grid h-8 w-8 place-items-center rounded-full bg-night text-moon shadow ${episode.favourite ? "top-12" : "top-2"}`}
            aria-label="Bedtime story"
          >
            <MoonStars size={18} weight="fill" />
          </span>
        )}
        {episode.heard && (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-bold text-leaf shadow">
            <CheckCircle size={14} weight="fill" /> Heard
          </span>
        )}
        {!episode.heard && (episode.progress ?? 0) > 0.02 && (
          <span className="absolute inset-x-2 bottom-1.5 h-1 overflow-hidden rounded-full bg-white/70">
            <span className="block h-full rounded-full bg-ember" style={{ width: `${Math.round((episode.progress ?? 0) * 100)}%` }} />
          </span>
        )}
        {(() => {
          const b = BANDS.find((x) => x.id === episode.band);
          return b ? (
            <span className="absolute bottom-3 left-2 rounded-full px-2.5 py-0.5 text-xs font-bold text-white" style={{ background: b.colour }}>
              {b.label} {b.ages}
            </span>
          ) : null;
        })()}
      </div>
      <p className="p-3 text-sm font-bold leading-snug">{episode.title ?? episode.question}</p>
    </Link>
  );
}
