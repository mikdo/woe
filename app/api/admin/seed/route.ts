import { db, type Family } from "@/lib/supabase/admin";
import { proceedAsk } from "@/lib/server/asks";
import type { Band } from "@/lib/types";

export const maxDuration = 300;

// Temporary: starts a few starter episodes for the admin family. Removed after use.
const SEEDS: { q: string; band: Band; who: "all" | "oldest" }[] = [
  { q: "Why do kangaroos hop?", band: "littles", who: "all" },
  { q: "Where does the sun go at night?", band: "littles", who: "all" },
  { q: "How do fish breathe underwater?", band: "littles", who: "all" },
  { q: "Why do volcanoes erupt?", band: "bigs", who: "oldest" },
  { q: "How big was the biggest dinosaur?", band: "bigs", who: "oldest" },
];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = process.env.SEED_KEY;
  if (!key || url.searchParams.get("key") !== key) return Response.json({ error: "Not found" }, { status: 404 });
  const i = Number(url.searchParams.get("i") ?? "0");
  const seed = SEEDS[i];
  if (!seed) return Response.json({ error: "No such seed" }, { status: 400 });

  const { data: family } = await db().from("families").select("*").eq("is_admin", true).limit(1).single();
  if (!family) return Response.json({ error: "No admin family" }, { status: 400 });
  const { data: kids } = await db().from("kids").select("id, age").eq("family_id", family.id).order("age", { ascending: false });
  const oldest = kids?.[0];

  const { data: ask, error } = await db()
    .from("asks")
    .insert({
      family_id: family.id,
      kid_id: seed.who === "oldest" ? oldest?.id ?? null : null,
      for_all: seed.who === "all",
      text: seed.q,
      source: "typed",
      band: seed.band,
      status: "triage",
      triage_reason: "Starter episode",
    })
    .select("id")
    .single();
  if (error || !ask) return Response.json({ error: error?.message }, { status: 500 });

  const result = await proceedAsk({ askId: ask.id, family: family as Family, question: seed.q, band: seed.band });
  return Response.json({ seed: seed.q, ...result });
}
