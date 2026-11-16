import { requireFamily, db, publicUrl, signedUrl } from "@/lib/supabase/admin";
import { ensureGroupClips, ensurePersonalClips, joinNames } from "@/lib/pipeline";
import type { Script, Fact, ClaimCheck } from "@/lib/types";

export const maxDuration = 60;

const KIT = ["theme", "jingle", "ding", "boing", "drumroll", "poof"] as const;

type Item = { url: string; pause_after_s: number; caption: string; kind: string; fx_url?: string };

/** Only real questions to the child get a thinking pause, and never a long one. */
function pauseFor(seg: Script["segments"][number]) {
  const last = seg.lines[seg.lines.length - 1]?.text.trim() ?? "";
  if (!seg.pause_after_s || !/\?["\u201d\)]*$/.test(last)) return 0;
  return Math.min(seg.pause_after_s, 2.5);
}

function caption(text: string) {
  return text.replace(/\[[^\]]+\]\s*/g, "").trim();
}

/** Builds the playlist: personal intro, episode segments (with pauses and sound effects), personal outro. */
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
  const items: Item[] = [];
  const sfx = Object.fromEntries(KIT.map((k) => [k, publicUrl(`kit/${k}.mp3`)]));

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

  // Theme tune → Otto's hello → personal "today's question comes from…" → the episode.
  items.push({ url: sfx.theme, pause_after_s: 0, caption: "🎵 What On Earth!", kind: "theme" });
  const segs = script.segments.filter((sg) => sg.audio_path);
  const helloCount = segs[0]?.beat === "hello" ? 1 : 0;
  const segItem = (seg: Script["segments"][number]): Item => ({
    url: publicUrl(seg.audio_path!),
    pause_after_s: pauseFor(seg),
    caption: seg.lines.map((l) => `${l.speaker === "otto" ? "Otto" : "Cheko"}: ${caption(l.text)}`).join("\n"),
    kind: seg.sfx && seg.sfx !== "jingle" ? `sfx:${seg.sfx}` : seg.beat,
    fx_url: seg.fx_path ? publicUrl(seg.fx_path) : undefined,
  });
  segs.slice(0, helloCount).forEach((sg) => items.push(segItem(sg)));
  if (clips?.intro_path) {
    const url = await signedUrl(clips.intro_path);
    if (url) items.push({ url, pause_after_s: 0, caption: `Today's question, ${hello}!`, kind: "intro" });
  }
  segs.slice(helloCount).forEach((sg) => items.push(segItem(sg)));
  if (clips?.outro_path) {
    const url = await signedUrl(clips.outro_path);
    if (url) items.push({ url, pause_after_s: 0, caption: `Bye, ${hello}!`, kind: "outro" });
  }
  items.push({ url: sfx.jingle, pause_after_s: 0, caption: "🎵", kind: "sting" });

  const facts = (ep.facts?.facts ?? []) as Fact[];
  const checks = (ep.facts?.checks ?? []) as ClaimCheck[];
  return Response.json({
    episode: {
      id: ep.id,
      title: ep.title ?? ep.question,
      question: ep.question,
      category: ep.category,
      cheko_form: ep.cheko_form,
      band: ep.band,
      art_url: ep.art_path ? publicUrl(ep.art_path) : null,
      talk_about_it: ep.talk_about_it ?? [],
      new_words: script.new_words ?? [],
      grownup_fact: script.grownup_fact ?? null,
      activities: script.activities ?? [],
    },
    items,
    sfx,
    ambience_url: script.ambience_path ? publicUrl(script.ambience_path) : null,
    sources: facts.map((f) => ({ id: f.id, fact: f.fact, url: f.source_url, title: f.source_title })),
    checks,
  });
}
