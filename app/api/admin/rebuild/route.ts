import { after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { produceEpisode } from "@/lib/pipeline";

export const maxDuration = 300;

/** TEMPORARY: restarts an episode run. Remove after the starter episodes are re-recorded. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key") ?? "";
  const expected = process.env.SEED_KEY ?? "";
  const ok = expected.length > 20 && key.length === expected.length && timingSafeEqual(Buffer.from(key), Buffer.from(expected));
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  after(() => produceEpisode(id).catch((e) => console.error("rebuild failed", id, e)));
  return Response.json({ rebuilding: id });
}
