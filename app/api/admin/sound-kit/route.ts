import { requireFamily } from "@/lib/supabase/admin";
import { ensureKit } from "@/lib/pipeline";

export const maxDuration = 300;

/** Remakes the shared theme tune and stings. Admin only. */
export async function POST(req: Request) {
  const auth = await requireFamily(req);
  if (auth instanceof Response) return auth;
  if (!auth.family.is_admin) return Response.json({ error: "Admins only" }, { status: 403 });
  try {
    return Response.json({ made: await ensureKit(true) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
