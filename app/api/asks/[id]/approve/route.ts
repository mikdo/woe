import { requireFamily, db } from "@/lib/supabase/admin";
import { proceedAsk } from "@/lib/server/asks";
import type { Band } from "@/lib/types";

export const maxDuration = 300;

/** A parent approves a "needs a grown-up" question (optionally reworded). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireFamily(req);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { text?: string; decline?: boolean };

  const { data: ask } = await db().from("asks").select("*").eq("id", id).eq("family_id", auth.family.id).maybeSingle();
  if (!ask || ask.status !== "needs_grownup") return Response.json({ error: "Nothing to approve" }, { status: 404 });

  if (body.decline) {
    await db().from("asks").update({ status: "not_suitable", triage_reason: "Declined by parent" }).eq("id", id);
    return Response.json({ askId: id, status: "not_suitable" });
  }
  const question = (body.text ?? ask.text).trim().slice(0, 300);
  await db().from("asks").update({ text: question, status: "triage" }).eq("id", id);
  const result = await proceedAsk({ askId: id, family: auth.family, question, band: ask.band as Band, parentEpisodeId: ask.parent_episode_id, bedtime: Boolean(ask.bedtime), kind: ask.kind === "journey" ? "journey" : "question" });
  return Response.json(result);
}
