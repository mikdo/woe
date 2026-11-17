import { timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { makeArt } from "@/lib/ai/gemini";
import { db } from "@/lib/supabase/admin";

export const maxDuration = 120;

// TEMPORARY: try cover art in Mikey's drawing style. Remove after use.
const SCENES: Record<string, string> = {
  bees:
    "Episode cover for 'How Do Bees Make Honey?'. Otto has flown by Wonder Hat INSIDE a giant golden beehive: glowing hexagon honeycomb walls, " +
    "dripping honey, friendly cartoon bees carrying nectar, Otto amazed and pointing. Cheko is hidden in the scene dressed as a bee " +
    "(yellow and black striped costume, little wings, antenna headband), peeking out of one honeycomb cell off to the side, small but findable.",
  caveman:
    "Episode cover for 'What Happened to the Cavemen?'. Otto has flown by Wonder Hat back to the Stone Age: a friendly early-human family " +
    "by a cave with simple paintings on the wall, a small campfire, a woolly mammoth wandering in the distance, Otto waving hello. " +
    "Cheko is hidden in the scene wearing a tiny fur outfit, peeking from behind a rock near the cave edge, small but findable.",
};
const STYLE =
  "Match the reference image's illustration style exactly: bold clean dark outlines, flat colours with simple cel shading, " +
  "a retro friendly cartoon look, pale sky-blue background feel and soft outlined clouds where it fits. " +
  "Use the same two characters as the reference: Otto, a cheerful boy explorer with a green bucket hat, orange shirt, brown vest, green pants, " +
  "brown boots and a backpack; and Cheko, a small tan stuffed-toy otter with stitched seams, round ears and a thick tail. " +
  "Square composition, no text, no letters, no logos.";

function preview(png: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath!, ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-vf", "scale=360:-1", "-q:v", "6", "-f", "image2", "-c:v", "mjpeg", "pipe:1"]);
    const out: Buffer[] = [];
    p.stdout.on("data", (d) => out.push(d));
    p.on("close", (c) => (c === 0 ? resolve(Buffer.concat(out)) : reject(new Error("ffmpeg " + c))));
    p.stdin.end(png);
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key") ?? "";
  const expected = process.env.SEED_KEY ?? "";
  if (!(expected.length > 20 && key.length === expected.length && timingSafeEqual(Buffer.from(key), Buffer.from(expected))))
    return Response.json({ error: "Not found" }, { status: 404 });
  const scene = SCENES[url.searchParams.get("scene") ?? ""];
  if (!scene) return Response.json({ error: "No scene" }, { status: 400 });
  const ref = Buffer.from(await (await fetch(new URL("/art/style-ref.jpg", url.origin))).arrayBuffer()).toString("base64");
  let png: Buffer;
  try {
    png = await makeArt(scene, [{ mimeType: "image/jpeg", data: ref }], STYLE);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
  const path = `style-tests/${url.searchParams.get("scene")}-${Date.now()}.png`;
  await db().storage.from("shared").upload(path, png, { contentType: "image/png", upsert: true });
  const small = await preview(png);
  return Response.json({
    full: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/shared/${path}`,
    preview: small.toString("base64"),
  });
}
