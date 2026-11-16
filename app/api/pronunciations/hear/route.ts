import { requireFamily } from "@/lib/supabase/admin";
import { applyAliases, speak } from "@/lib/ai/eleven";

export const maxDuration = 60;

/** Otto says a word the way an episode would, so a grown-up can check it. */
export async function POST(req: Request) {
  const auth = await requireFamily(req);
  if (auth instanceof Response) return auth;
  const { word, alias } = (await req.json().catch(() => ({}))) as { word?: string; alias?: string };
  const w = (word ?? "").trim().slice(0, 80);
  if (!w) return Response.json({ error: "No word" }, { status: 400 });
  const said = alias?.trim() ? applyAliases(w, [{ word: w, alias: alias.trim().slice(0, 80) }]) : w;
  try {
    const audio = await speak([{ speaker: "otto", text: `${said}. Let's say it together: ${said}!` }]);
    return new Response(new Uint8Array(audio), { headers: { "Content-Type": "audio/mpeg" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Voice failed" }, { status: 502 });
  }
}
