import { timingSafeEqual } from "node:crypto";
import { db, type Family } from "@/lib/supabase/admin";
import { proceedAsk } from "@/lib/server/asks";
import type { Band } from "@/lib/types";

export const maxDuration = 300;

// TEMPORARY: starts test episodes for the admin family. Remove after use.
const SEEDS: { q: string; band: Band; who: "all" | "oldest" }[] = [
  { q: "Why do cats purr?", band: "littles", who: "all" },
  { q: "How do bees make honey?", band: "littles", who: "all" },
  { q: "Why do we need to sleep?", band: "littles", who: "all" },
  { q: "Why is the sky blue?", band: "bigs", who: "oldest" },
  { q: "How do rockets get to space?", band: "bigs", who: "oldest" },
];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key") ?? "";
  const expected = process.env.SEED_KEY ?? "";
  const ok = expected.length > 20 && key.length === expected.length && timingSafeEqual(Buffer.from(key), Buffer.from(expected));
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
  const seed = SEEDS[Number(url.searchParams.get("i") ?? "-1")];
  if (!seed) return Response.json({ error: "No such seed" }, { status: 400 });

  const { data: family } = await db().from("families").select("*").eq("is_admin", true).limit(1).single();
  if (!family) return Response.json({ error: "No admin family" }, { status: 400 });
  const { data: kids } = await db().from("kids").select("id, age").eq("family_id", family.id).order("age", { ascending: false });
  const { data: ask, error } = await db()
    .from("asks")
    .insert({
      family_id: family.id,
      kid_id: seed.who === "oldest" ? kids?.[0]?.id ?? null : null,
      for_all: seed.who === "all",
      text: seed.q,
      source: "typed",
      band: seed.band,
      status: "triage",
      triage_reason: "Test episode",
    })
    .select("id")
    .single();
  if (error || !ask) return Response.json({ error: error?.message }, { status: 500 });
  const result = await proceedAsk({ askId: ask.id, family: family as Family, question: seed.q, band: seed.band });
  return Response.json({ seed: seed.q, ...result });
}
