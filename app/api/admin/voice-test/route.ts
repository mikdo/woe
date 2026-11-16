import { requireFamily, db } from "@/lib/supabase/admin";
import { applyAliases, speak } from "@/lib/ai/eleven";
import type { Speaker } from "@/lib/types";

export const maxDuration = 60;

type Line = { speaker: Speaker; text: string };

const SAMPLES: Line[][] = [
  [
    { speaker: "otto", text: "Hey hey! Welcome to What On Earth! I'm Otto." },
    { speaker: "cheko", text: "And I'm Cheko!" },
    { speaker: "otto", text: "[curious] Whoaaa… what on earth is… a volcano?!" },
    { speaker: "cheko", text: "[excited] Cheko… CHANGE-O! Ooh, look, I'm a dinosaur!" },
    { speaker: "otto", text: "A dinosaur. For volcanoes. Sure, why not." },
  ],
  [
    { speaker: "otto", text: "Deep, deep under the ground, it's super hot. So hot that rock melts! Hotter than a car seat in January." },
    { speaker: "otto", text: "That melted rock has a special name. It's called magma. Mag… ma. Can you say it?" },
    { speaker: "cheko", text: "Magma! Magma! MAGMA!" },
    { speaker: "otto", text: "[laughs] Great job! Magma!" },
  ],
  [
    { speaker: "otto", text: "Okay, game time! True or false? Volcanoes are only on land." },
    { speaker: "cheko", text: "TRUE! Definitely true. One hundred percent." },
    { speaker: "otto", text: "Ooh, good guess, Cheko… but it's false! Lots of volcanoes are under the ocean." },
    { speaker: "cheko", text: "[gasps] Underwater volcanoes?! Whoa!" },
    { speaker: "otto", text: "Keep wondering, and keep asking... what on earth?" },
  ],
];

/** Admin only: plays sample lines so the voices can be auditioned. */
export async function POST(req: Request) {
  const auth = await requireFamily(req);
  if (auth instanceof Response) return auth;
  if (!auth.family.is_admin) return Response.json({ error: "Admins only" }, { status: 403 });
  const { sample = 0 } = (await req.json().catch(() => ({}))) as { sample?: number };
  const lines = SAMPLES[sample] ?? SAMPLES[0];
  const { data } = await db().from("pronunciations").select("word, alias").is("family_id", null);
  const rules = (data ?? []) as { word: string; alias: string }[];
  try {
    const audio = await speak(lines.map((l) => ({ ...l, text: applyAliases(l.text, rules) })));
    return new Response(new Uint8Array(audio), { headers: { "Content-Type": "audio/mpeg" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Voice failed" }, { status: 502 });
  }
}
