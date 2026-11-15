import { requireFamily, db } from "@/lib/supabase/admin";
import { missingKeys } from "@/lib/config";
import { triage } from "@/lib/pipeline";
import { proceedAsk } from "@/lib/server/asks";
import { bandForAge, type Band } from "@/lib/types";

export const maxDuration = 300;

export async function POST(req: Request) {
  const auth = await requireFamily(req);
  if (auth instanceof Response) return auth;
  const missing = missingKeys();
  if (missing.length) return Response.json({ error: `Server is missing: ${missing.join(", ")}` }, { status: 503 });

  const body = (await req.json()) as { kidId?: string; text?: string; source?: "voice" | "typed"; band?: Band };
  const text = (body.text ?? "").trim().slice(0, 300);
  if (!text) return Response.json({ error: "No question" }, { status: 400 });

  const { data: famKids } = await db().from("kids").select("*").eq("family_id", auth.family.id);
  const allKids = famKids ?? [];
  const forAll = body.kidId === "all";
  const kid = forAll ? null : allKids.find((k) => k.id === body.kidId);
  if (!forAll && !kid) return Response.json({ error: "Pick who is asking" }, { status: 400 });
  if (forAll && allKids.length === 0) return Response.json({ error: "Add a kid first" }, { status: 400 });
  // Listening together uses the youngest kid's band.
  const youngest = Math.min(...(forAll ? allKids : [kid!]).map((k) => k.age));
  const band: Band = body.band ?? bandForAge(youngest);

  const t = await triage(text, band);
  const status =
    t.verdict === "ok" ? "triage" : t.verdict === "needs_grownup" ? "needs_grownup" : t.verdict === "not_suitable" ? "not_suitable" : "failed";

  const { data: ask, error } = await db()
    .from("asks")
    .insert({
      family_id: auth.family.id,
      kid_id: kid?.id ?? null,
      for_all: forAll,
      text: t.question || text,
      source: body.source ?? "voice",
      band,
      status,
      triage_reason: t.verdict === "unclear" ? `unclear: ${t.reason}` : t.reason,
    })
    .select("id")
    .single();
  if (error || !ask) return Response.json({ error: error?.message ?? "Could not save" }, { status: 500 });

  if (t.verdict !== "ok") {
    return Response.json({ askId: ask.id, status: t.verdict, reason: t.reason, question: t.question });
  }
  const result = await proceedAsk({
    askId: ask.id,
    family: auth.family,
    question: t.question || text,
    band,
    category: t.category,
    chekoForm: t.cheko_form,
  });
  return Response.json({ ...result, question: t.question });
}
