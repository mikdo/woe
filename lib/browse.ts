"use client";
import { supabase } from "@/lib/supabase/browser";
import { CATEGORIES } from "@/lib/types";
import type { EpisodeLite } from "@/components/EpisodeCard";

/** Everything the Search screen's tiles are built from. */
export type BrowseEpisode = EpisodeLite & { created_at: string; kidIds: string[] };

export type Tile = {
  id: string;
  label: string;
  colour: string;
  emoji: string;
  /** Shown at the top of the tile's list. */
  blurb: string;
  pick: (e: BrowseEpisode) => boolean;
  /** Latest is capped; everything else shows all. */
  limit?: number;
};

const KID_COLOURS = ["#db2777", "#7c3aed", "#059669", "#ea580c", "#2563eb"];

const FIELDS = "id, title, question, category, art_path, cheko_form, status, band, bedtime, kind, created_at";

/** Ready episodes this family can see (shared ones, their own and their library), newest first. */
export async function loadBrowse(): Promise<BrowseEpisode[]> {
  const [eps, lib, asks] = await Promise.all([
    supabase().from("episodes").select(FIELDS).eq("status", "ready").order("created_at", { ascending: false }).limit(400),
    supabase().from("family_library").select("episode_id, kid_id, favourite"),
    supabase().from("asks").select("episode_id, kid_id").not("kid_id", "is", null).not("episode_id", "is", null),
  ]);
  const kidsFor = new Map<string, Set<string>>();
  const fav = new Set<string>();
  const add = (ep: string | null, kid: string | null) => {
    if (!ep || !kid) return;
    if (!kidsFor.has(ep)) kidsFor.set(ep, new Set());
    kidsFor.get(ep)!.add(kid);
  };
  for (const r of (lib.data ?? []) as { episode_id: string; kid_id: string | null; favourite: boolean }[]) {
    add(r.episode_id, r.kid_id);
    if (r.favourite) fav.add(r.episode_id);
  }
  for (const r of (asks.data ?? []) as { episode_id: string | null; kid_id: string | null }[]) add(r.episode_id, r.kid_id);
  return ((eps.data ?? []) as (EpisodeLite & { created_at: string })[]).map((e) => ({
    ...e,
    favourite: fav.has(e.id),
    kidIds: [...(kidsFor.get(e.id) ?? [])],
  }));
}

/** The browse tiles, in order: the special shelves, then topics, then each kid's own. */
export function tilesFor(kids: { id: string; name: string }[]): Tile[] {
  return [
    { id: "latest", label: "Latest", colour: "#e8793a", emoji: "✨", blurb: "The newest adventures", pick: () => true, limit: 30 },
    { id: "journeys", label: "Journeys", colour: "#0f766e", emoji: "🧭", blurb: "Wonder Hat tours of amazing places", pick: (e) => e.kind === "journey" },
    {
      id: "adventures",
      label: "Adventures",
      colour: "#0284c7",
      emoji: "🎩",
      blurb: "One big question, one Wonder Hat trip",
      pick: (e) => e.kind !== "journey" && !e.bedtime,
    },
    { id: "bedtime", label: "Bedtime", colour: "#1e2a4a", emoji: "🌙", blurb: "Soft and sleepy, for winding down", pick: (e) => Boolean(e.bedtime) },
    { id: "favourites", label: "Favourites", colour: "#d97706", emoji: "⭐", blurb: "The ones you starred", pick: (e) => Boolean(e.favourite) },
    ...CATEGORIES.map((c) => ({
      id: `topic-${c.id}`,
      label: c.label,
      colour: c.colour,
      emoji: c.emoji,
      blurb: `Everything about ${c.label.toLowerCase()}`,
      pick: (e: BrowseEpisode) => e.category === c.id,
    })),
    ...kids.map((k, i) => ({
      id: `kid-${k.id}`,
      label: `${k.name}'s`,
      colour: KID_COLOURS[i % KID_COLOURS.length],
      emoji: "🙋",
      blurb: `Questions ${k.name} asked and listened to`,
      pick: (e: BrowseEpisode) => e.kidIds.includes(k.id),
    })),
  ];
}

export function tileEpisodes(tile: Tile, all: BrowseEpisode[]) {
  const list = all.filter(tile.pick);
  return tile.limit ? list.slice(0, tile.limit) : list;
}
