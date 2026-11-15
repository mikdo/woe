import Link from "next/link";
import { CATEGORIES } from "@/lib/types";

export type EpisodeLite = {
  id: string;
  title: string | null;
  question: string;
  category: string | null;
  art_path: string | null;
  cheko_form: string | null;
  status: string;
  favourite?: boolean;
};

export function artUrl(path: string | null) {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/shared/${path}`;
}

export function EpisodeCard({ episode, href }: { episode: EpisodeLite; href: string }) {
  const cat = CATEGORIES.find((c) => c.id === episode.category);
  const art = artUrl(episode.art_path);
  return (
    <Link href={href} className="group overflow-hidden rounded-3xl bg-white shadow-[0_4px_0_#f1e4cc] ring-1 ring-orange-100 transition active:scale-95">
      <div className="relative aspect-square" style={{ background: cat?.colour ?? "#38bdf8" }}>
        {art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={art} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="grid h-full place-items-center text-6xl">{cat?.emoji ?? "🌏"}</div>
        )}
        {episode.favourite && <span className="absolute right-2 top-2 text-2xl">⭐</span>}
      </div>
      <p className="p-3 font-display text-base font-semibold leading-tight">{episode.title ?? episode.question}</p>
    </Link>
  );
}
