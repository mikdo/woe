import { randomBytes } from "node:crypto";
import { db, requireFamily } from "@/lib/supabase/admin";

/** The family's invite link and the other grown-ups in it. */
export async function GET(req: Request) {
  const auth = await requireFamily(req);
  if (auth instanceof Response) return auth;
  const { data: members } = await db().from("family_members").select("user_id, email, created_at").eq("family_id", auth.family.id);
  const { data: fam } = await db().from("families").select("invite_code").eq("id", auth.family.id).single();
  return Response.json({ code: auth.isOwner ? fam?.invite_code ?? null : null, isOwner: auth.isOwner, members: members ?? [] });
}

/** Makes a new invite code (the old link stops working). Owner only. */
export async function POST(req: Request) {
  const auth = await requireFamily(req);
  if (auth instanceof Response) return auth;
  if (!auth.isOwner) return Response.json({ error: "Only the grown-up who set up the family can invite" }, { status: 403 });
  const code = randomBytes(9).toString("base64url");
  await db().from("families").update({ invite_code: code }).eq("id", auth.family.id);
  return Response.json({ code });
}

/** Removes a grown-up, or turns the invite link off. Owner only. */
export async function DELETE(req: Request) {
  const auth = await requireFamily(req);
  if (auth instanceof Response) return auth;
  if (!auth.isOwner) return Response.json({ error: "Not allowed" }, { status: 403 });
  const userId = new URL(req.url).searchParams.get("user");
  if (userId) await db().from("family_members").delete().eq("family_id", auth.family.id).eq("user_id", userId);
  else await db().from("families").update({ invite_code: null }).eq("id", auth.family.id);
  return Response.json({ ok: true });
}
