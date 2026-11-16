import { db, requireFamily } from "@/lib/supabase/admin";

type Row = { id: string; family_id: string | null; word: string; alias: string; approved: boolean };

/** The word list: shared words (used in every episode) and this family's own. */
export async function GET(req: Request) {
  const auth = await requireFamily(req);
  if (auth instanceof Response) return auth;
  const { data } = await db().from("pronunciations").select("id, family_id, word, alias, approved").order("word");
  const rows = ((data ?? []) as Row[]).filter((r) => r.family_id === null || r.family_id === auth.family.id);
  return Response.json({ words: rows, canEditShared: auth.family.is_admin });
}

function clean(s: unknown, max = 80) {
  return typeof s === "string" ? s.trim().slice(0, max) : "";
}

export async function POST(req: Request) {
  const auth = await requireFamily(req);
  if (auth instanceof Response) return auth;
  const body = (await req.json().catch(() => ({}))) as { word?: string; alias?: string; shared?: boolean };
  const word = clean(body.word);
  const alias = clean(body.alias);
  if (!word || !alias) return Response.json({ error: "Add the word and how to say it" }, { status: 400 });
  const shared = Boolean(body.shared) && auth.family.is_admin;
  const family_id = shared ? null : auth.family.id;
  const existing = await db().from("pronunciations").select("id").eq("word", word).filter("family_id", shared ? "is" : "eq", shared ? null : auth.family.id).maybeSingle();
  if (existing.data) await db().from("pronunciations").update({ alias, approved: true }).eq("id", existing.data.id);
  else await db().from("pronunciations").insert({ family_id, word, alias, approved: true });
  return Response.json({ ok: true });
}

async function owned(id: string, familyId: string, isAdmin: boolean) {
  const { data } = await db().from("pronunciations").select("family_id").eq("id", id).maybeSingle();
  if (!data) return false;
  return data.family_id === familyId || (data.family_id === null && isAdmin);
}

export async function PATCH(req: Request) {
  const auth = await requireFamily(req);
  if (auth instanceof Response) return auth;
  const body = (await req.json().catch(() => ({}))) as { id?: string; alias?: string; approved?: boolean };
  if (!body.id || !(await owned(body.id, auth.family.id, auth.family.is_admin))) return Response.json({ error: "Not allowed" }, { status: 403 });
  const patch: Record<string, unknown> = {};
  if (body.alias !== undefined) patch.alias = clean(body.alias);
  if (body.approved !== undefined) patch.approved = Boolean(body.approved);
  await db().from("pronunciations").update(patch).eq("id", body.id);
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const auth = await requireFamily(req);
  if (auth instanceof Response) return auth;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!(await owned(id, auth.family.id, auth.family.is_admin))) return Response.json({ error: "Not allowed" }, { status: 403 });
  await db().from("pronunciations").delete().eq("id", id);
  return Response.json({ ok: true });
}
