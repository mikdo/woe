import { requireFamily } from "@/lib/supabase/admin";
import { ensureKit } from "@/lib/pipeline";
import { isOutOfCredits } from "@/lib/ai/eleven";
import { VOICE_CREDITS_MESSAGE } from "@/lib/stages";

export const maxDuration = 300;

/** Remakes the shared theme tune and stings. Admin only. */
export async function POST(req: Request) {
  const auth = await requireFamily(req);
  if (auth instanceof Response) return auth;
  if (!auth.family.is_admin) return Response.json({ error: "Admins only" }, { status: 403 });
  try {
    return Response.json({ made: await ensureKit(true) });
  } catch (e) {
    if (isOutOfCredits(e)) return Response.json({ error: VOICE_CREDITS_MESSAGE, code: "no_credits" }, { status: 402 });
    return Response.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
