import { requireFamily } from "@/lib/supabase/admin";
import { countEdited, rerecordEdited } from "@/lib/pipeline";
import { isOutOfCredits } from "@/lib/ai/eleven";
import { VOICE_CREDITS_MESSAGE } from "@/lib/stages";

export const maxDuration = 300;

/** How many edited lines are waiting to be re-recorded. Admin only. */
export async function GET(req: Request) {
  const auth = await requireFamily(req);
  if (auth instanceof Response) return auth;
  if (!auth.family.is_admin) return Response.json({ error: "Admins only" }, { status: 403 });
  return Response.json({ left: await countEdited() });
}

/** Re-voices just the edited segments of finished episodes. Admin only. */
export async function POST(req: Request) {
  const auth = await requireFamily(req);
  if (auth instanceof Response) return auth;
  if (!auth.family.is_admin) return Response.json({ error: "Admins only" }, { status: 403 });
  try {
    return Response.json(await rerecordEdited());
  } catch (e) {
    if (isOutOfCredits(e)) return Response.json({ error: VOICE_CREDITS_MESSAGE, code: "no_credits", left: await countEdited() }, { status: 402 });
    return Response.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
