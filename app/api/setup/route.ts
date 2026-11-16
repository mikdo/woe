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
  const { data: member } = await db().from("family_members").select("family_id").eq("user_id", data.user.id).maybeSingle();
  if (member) {
    const { data: fam } = await db().from("families").select("*").eq("id", member.family_id).single();
    return Response.json({ family: fam });
  }

  const isAdmin = config.adminEmails.includes((data.user.email ?? "").toLowerCase());
  const { data: family, error: insErr } = await db()
    .from("families")
    .insert({ owner_id: data.user.id, name: (name ?? "Our family").slice(0, 60), is_admin: isAdmin, monthly_new_limit: isAdmin ? 1000 : 20 })
    .select("*")
    .single();
  if (insErr) return Response.json({ error: insErr.message }, { status: 500 });
  return Response.json({ family });
}
