import { timingSafeEqual } from "node:crypto";
import { coverArt } from "@/lib/ai/gemini";
import { db } from "@/lib/supabase/admin";
import type { Script } from "@/lib/types";

export const maxDuration = 120;

// TEMPORARY: redraw an existing episode's cover in Mikey's style. Remove after use.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key") ?? "";
  const expected = process.env.SEED_KEY ?? "";
  if (!(expected.length > 20 && key.length === expected.length && timingSafeEqual(Buffer.from(key), Buffer.from(expected))))
    return Response.json({ error: "Not found" }, { status: 404 });
  const id = url.searchParams.get("id");
  const { data: ep } = await db().from("episodes").select("id, question, script").eq("id", id ?? "").single();
  if (!ep) return Response.json({ error: "No episode" }, { status: 404 });
  const scene = (ep.script as Script | null)?.art_prompt || `A cover for the kids' question "${ep.question}"`;
  try {
    const png = await coverArt(scene);
    const path = `episodes/${ep.id}/cover-${Date.now().toString(36)}.png`;
    await db().storage.from("shared").upload(path, png, { contentType: "image/png", upsert: true });
    await db().from("episodes").update({ art_path: path }).eq("id", ep.id);
    return Response.json({ id: ep.id, path });
  } catch (e) {
    return Response.json({ id: ep.id, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
