import Link from "next/link";
import { artUrl } from "@/components/EpisodeCard";

/** A colourful Spotify-style tile with a tilted cover peeking out of the corner. */
export function BrowseTile({ href, label, colour, emoji, art }: { href: string; label: string; colour: string; emoji: string; art: string | null }) {
  const src = artUrl(art);
  return (
    <Link
      href={href}
      className="press relative block aspect-[16/10] overflow-hidden rounded-2xl p-3 text-white shadow-[0_4px_0_rgb(0_0_0/0.12)]"
      style={{ background: colour }}
    >
      <span className="relative z-10 block max-w-[70%] font-display text-base font-bold leading-tight drop-shadow-sm">{label}</span>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          className="absolute -bottom-2 -right-4 h-[72%] w-auto rotate-[25deg] rounded-lg object-cover shadow-[0_4px_12px_rgb(0_0_0/0.35)]"
          style={{ aspectRatio: "1 / 1" }}
        />
      ) : (
        <span className="absolute -bottom-1 right-1 rotate-[20deg] text-5xl" aria-hidden>
          {emoji}
        </span>
      )}
    </Link>
  );
}
