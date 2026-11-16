import { db } from "@/lib/supabase/admin";

/** Joins the family behind an invite code. */
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { data, error } = await db().auth.getUser(token);
  if (error || !data.user) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  if (!code || code.length < 8) return Response.json({ error: "That invite link isn't right" }, { status: 400 });

  const { data: fam } = await db().from("families").select("id, name, owner_id").eq("invite_code", code).maybeSingle();
  if (!fam) return Response.json({ error: "That invite link has expired. Ask for a new one." }, { status: 404 });
  if (fam.owner_id === data.user.id) return Response.json({ joined: fam.name });

  const { data: own } = await db().from("families").select("id").eq("owner_id", data.user.id).maybeSingle();
  if (own) return Response.json({ error: "This email already has its own WOE! family. Sign in with a different email to join." }, { status: 409 });
  const { data: other } = await db().from("family_members").select("family_id").eq("user_id", data.user.id).maybeSingle();
  if (other && other.family_id !== fam.id) return Response.json({ error: "This email is already in another family." }, { status: 409 });
  if (!other) await db().from("family_members").insert({ family_id: fam.id, user_id: data.user.id, email: data.user.email });
  return Response.json({ joined: fam.name });
}
