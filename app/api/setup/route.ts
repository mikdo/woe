import { db } from "@/lib/supabase/admin";
import { config } from "@/lib/config";

/** Creates the signed-in parent's family (admin flag comes from ADMIN_EMAILS). */
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { data, error } = await db().auth.getUser(token);
  if (error || !data.user) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { name } = (await req.json().catch(() => ({}))) as { name?: string };

  const { data: existing } = await db().from("families").select("*").eq("owner_id", data.user.id).maybeSingle();
  if (existing) return Response.json({ family: existing });

  const isAdmin = config.adminEmails.includes((data.user.email ?? "").toLowerCase());
  const { data: family, error: insErr } = await db()
    .from("families")
    .insert({ owner_id: data.user.id, name: (name ?? "Our family").slice(0, 60), is_admin: isAdmin, monthly_new_limit: isAdmin ? 1000 : 20 })
    .select("*")
    .single();
  if (insErr) return Response.json({ error: insErr.message }, { status: 500 });
  return Response.json({ family });
}
