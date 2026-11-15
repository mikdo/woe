import { requireFamily, db } from "@/lib/supabase/admin";
import { soundEffect } from "@/lib/ai/eleven";

export const maxDuration = 120;

const KIT: Record<string, { prompt: string; seconds: number }> = {
  jingle: { prompt: "Short cheerful kids' show theme jingle, ukulele and glockenspiel, bright and warm, ends on a happy note", seconds: 5 },
  ding: { prompt: "Soft friendly correct-answer chime, single bright ding", seconds: 1 },
  boing: { prompt: "Silly cartoon boing spring sound, gentle and funny", seconds: 1 },
  drumroll: { prompt: "Short soft snare drumroll building suspense, for kids", seconds: 2 },
  poof: { prompt: "Magical sparkle poof transformation sound with twinkles", seconds: 2 },
};

/** One-off: makes the reusable sound kit. Admin only. */
export async function POST(req: Request) {
  const auth = await requireFamily(req);
  if (auth instanceof Response) return auth;
  if (!auth.family.is_admin) return Response.json({ error: "Admins only" }, { status: 403 });
  const made: string[] = [];
  for (const [name, { prompt, seconds }] of Object.entries(KIT)) {
    const bytes = await soundEffect(prompt, seconds);
    const { error } = await db().storage.from("shared").upload(`kit/${name}.mp3`, bytes, { contentType: "audio/mpeg", upsert: true });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    made.push(name);
  }
  return Response.json({ made });
}
