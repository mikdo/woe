import { requireFamily, db, publicUrl, signedUrl } from "@/lib/supabase/admin";
import { ensureGroupClips, ensurePersonalClips, joinNames } from "@/lib/pipeline";
import type { Script, Fact, ClaimCheck } from "@/lib/types";
import { ensureMix } from "@/lib/audio/render";

export const maxDuration = 300;

/** The episode for a listener: one mixed audio file with cues for captions and thinking pauses. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireFamily(req);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  const kidId = new URL(req.url).searchParams.get("kid");

  const { data: ep } = await db().from("episodes").select("*").eq("id", id).single();
  if (!ep) return Response.json({ error: "Not found" }, { status: 404 });
  const { data: inLib } = await db()
    .from("family_library")
    .select("episode_id")
    .eq("family_id", auth.family.id)
    .eq("episode_id", id)
    .maybeSingle();
  const allowed = (ep.shared && ep.status === "ready") || ep.created_by_family === auth.family.id || Boolean(inLib);
  if (!allowed) return Response.json({ error: "Not found" }, { status: 404 });
  if (ep.status !== "ready") return Response.json({ error: "Not ready yet", status: ep.status }, { status: 409 });

  const script = ep.script as Script;

  let kid: { id: string; family_id: string; name: string; name_say_as: string | null; age: number } | null = null;
  if (kidId && kidId !== "all") {
    const { data } = await db().from("kids").select("*").eq("id", kidId).eq("family_id", auth.family.id).maybeSingle();
    kid = data;
  }
  let clips: { intro_path: string | null; outro_path: string | null } | null = null;
  let hello = "";
  if (kidId === "all") {
    const { data: ask } = await db()
      .from("asks")
      .select("id")
      .eq("family_id", auth.family.id)
      .eq("for_all", true)
      .eq("episode_id", id)
      .eq("created_new", true)
      .limit(1);
    clips = await ensureGroupClips(auth.family.id, id, Boolean(ask?.length)).catch(() => null);
    const { data: fk } = await db().from("kids").select("name").eq("family_id", auth.family.id).order("created_at");
    hello = joinNames((fk ?? []).map((k) => k.name));
    await db()
      .from("family_library")
      .upsert({ family_id: auth.family.id, episode_id: id }, { onConflict: "family_id,episode_id", ignoreDuplicates: true });
    await db().from("plays").insert({ family_id: auth.family.id, episode_id: id });
  } else if (kid) {
    hello = kid.name;
    const { data: ask } = await db()
      .from("asks")
      .select("id")
      .eq("kid_id", kid.id)
      .eq("episode_id", id)
      .eq("created_new", true)
      .limit(1);
    clips = await ensurePersonalClips(kid, id, Boolean(ask?.length)).catch(() => null);
    await db()
      .from("family_library")
      .upsert({ family_id: auth.family.id, episode_id: id, kid_id: kid.id }, { onConflict: "family_id,episode_id", ignoreDuplicates: true });
    await db().from("plays").insert({ family_id: auth.family.id, kid_id: kid.id, episode_id: id });
  }

  const listener = kidId === "all" ? "all" : kid ? kid.id : "library";
  const mix = await ensureMix({
    episodeId: id,
    script,
    listenerPath: `${auth.family.id}/${listener}`,
    introPath: clips?.intro_path ?? null,
    outroPath: clips?.outro_path ?? null,
    hello,
    bedtime: Boolean(ep.bedtime),
  });
  const url = await signedUrl(mix.path);
  if (!url) return Response.json({ error: "Couldn't load the audio" }, { status: 500 });

  const facts = (ep.facts?.facts ?? []) as Fact[];
  const checks = (ep.facts?.checks ?? []) as ClaimCheck[];
  // The topic trail: what this followed on from, and what followed on from it.
  const [{ data: parent }, { data: children }] = await Promise.all([
    ep.parent_episode_id
      ? db().from("episodes").select("id, title, question").eq("id", ep.parent_episode_id).eq("status", "ready").maybeSingle()
      : Promise.resolve({ data: null }),
    db()
      .from("episodes")
      .select("id, title, question")
      .eq("parent_episode_id", ep.id)
      .eq("status", "ready")
      .or(`shared.eq.true,created_by_family.eq.${auth.family.id}`)
      .limit(6),
  ]);

  return Response.json({
    episode: {
      id: ep.id,
      title: ep.title ?? ep.question,
      question: ep.question,
      category: ep.category,
      cheko_form: ep.cheko_form,
      band: ep.band,
      bedtime: Boolean(ep.bedtime),
      art_url: ep.art_path ? publicUrl(ep.art_path) : null,
      talk_about_it: ep.talk_about_it ?? [],
      new_words: script.new_words ?? [],
      grownup_fact: script.grownup_fact ?? null,
      activities: script.activities ?? [],
      follow_ups: script.follow_ups ?? [],
      parent: parent ? { id: parent.id, title: parent.title ?? parent.question } : null,
      children: (children ?? []).map((c) => ({ id: c.id, title: c.title ?? c.question })),
    },
    audio: { url, duration: mix.duration, cues: mix.cues },
    sources: facts.map((f) => ({ id: f.id, fact: f.fact, url: f.source_url, title: f.source_title })),
    checks,
  });
}
