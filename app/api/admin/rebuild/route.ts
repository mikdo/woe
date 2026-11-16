import { after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/supabase/admin";
import { ensureGroupClips, joinNames, produceEpisode } from "@/lib/pipeline";
import { ensureMix } from "@/lib/audio/render";
import type { Script } from "@/lib/types";

export const maxDuration = 300;

/** TEMPORARY: restarts an episode run, or pre-mixes the "All of us" version. Remove after use. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key") ?? "";
  const expected = process.env.SEED_KEY ?? "";
  const ok = expected.length > 20 && key.length === expected.length && timingSafeEqual(Buffer.from(key), Buffer.from(expected));
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  if (url.searchParams.get("mix")) {
    const { data: ep } = await db().from("episodes").select("*").eq("id", id).single();
    if (!ep || ep.status !== "ready") return Response.json({ error: "Not ready" }, { status: 409 });
    const fam = ep.created_by_family as string;
    const t0 = Date.now();
    try {
      const clips = await ensureGroupClips(fam, id, true);
      const { data: kids } = await db().from("kids").select("name").eq("family_id", fam).order("created_at");
      const mix = await ensureMix({
        episodeId: id,
        script: ep.script as Script,
        listenerPath: `${fam}/all`,
        introPath: clips.intro_path,
        outroPath: clips.outro_path,
        hello: joinNames((kids ?? []).map((k) => k.name)),
      });
      return Response.json({ seconds: (Date.now() - t0) / 1000, duration: mix.duration, cues: mix.cues.length, thinks: mix.cues.filter((c) => c.think).length });
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }
  after(() => produceEpisode(id).catch((e) => console.error("rebuild failed", id, e)));
  return Response.json({ rebuilding: id });
}
