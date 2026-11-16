import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "@/lib/config";

let admin: SupabaseClient | null = null;

/** Service-role client. Server only: bypasses row-level security. */
export function db(): SupabaseClient {
  if (!admin) {
    admin = createClient(config.supabaseUrl, config.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}

export type Family = { id: string; owner_id: string; name: string; monthly_new_limit: number; is_admin: boolean };

/** Reads the bearer token, returns the user and their family (or a Response to return on failure). */
export async function requireFamily(
  req: Request,
): Promise<{ userId: string; email: string; family: Family; isOwner: boolean } | Response> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { data, error } = await db().auth.getUser(token);
  if (error || !data.user) return Response.json({ error: "Not signed in" }, { status: 401 });
  let { data: family } = await db().from("families").select("*").eq("owner_id", data.user.id).maybeSingle();
  const isOwner = Boolean(family);
  if (!family) {
    const { data: m } = await db().from("family_members").select("family_id").eq("user_id", data.user.id).maybeSingle();
    if (m) ({ data: family } = await db().from("families").select("*").eq("id", m.family_id).maybeSingle());
  }
  if (!family) return Response.json({ error: "Set up your family first" }, { status: 400 });
  return { userId: data.user.id, email: data.user.email ?? "", family: family as Family, isOwner };
}

export function publicUrl(path: string): string {
  return db().storage.from("shared").getPublicUrl(path).data.publicUrl;
}

export async function signedUrl(path: string, seconds = 60 * 60 * 24 * 7): Promise<string | null> {
  const { data } = await db().storage.from("personal").createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}
