import { after } from "next/server";
import { requireFamily, db } from "@/lib/supabase/admin";
import { produceEpisode } from "@/lib/pipeline";

export const maxDuration = 300;

/** Restarts a stalled episode (or one parked for voice credits) from its last saved step. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireFamily(req);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  const { data: ep } = await db().from("episodes").select("id, status, stage, updated_at, created_by_family").eq("id", id).single();
  if (!ep || ep.created_by_family !== auth.family.id) return Response.json({ error: "Not found" }, { status: 404 });
  if (ep.status !== "generating") return Response.json({ status: ep.status });
  const stale = Date.now() - new Date(ep.updated_at).getTime() > 4 * 60 * 1000;
  if (ep.stage !== "error" && ep.stage !== "no_credits" && !stale) return Response.json({ status: "still working" });
  await db().from("episodes").update({ stage: "resuming", error: null, updated_at: new Date().toISOString() }).eq("id", id);
  after(() => produceEpisode(id).catch((e) => console.error("resume failed", id, e)));
  return Response.json({ status: "resumed" });
}
