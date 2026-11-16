import { after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { config } from "@/lib/config";
import { produceEpisode } from "@/lib/pipeline";

export const maxDuration = 300;

/** Server-to-server: continues a long episode in a fresh function run. */
export async function POST(req: Request) {
  const key = req.headers.get("x-internal-key") ?? "";
  const expected = config.supabaseServiceKey;
  const ok = expected && key.length === expected.length && timingSafeEqual(Buffer.from(key), Buffer.from(expected));
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
  const { episodeId } = (await req.json()) as { episodeId?: string };
  if (!episodeId) return Response.json({ error: "Missing episode" }, { status: 400 });
  after(() => produceEpisode(episodeId).catch((e) => console.error("continue failed", episodeId, e)));
  return Response.json({ continuing: episodeId });
}
