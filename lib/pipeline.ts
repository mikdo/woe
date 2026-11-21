import "server-only";
import { config } from "@/lib/config";
import { db, type Family } from "@/lib/supabase/admin";
import { ensureMix } from "@/lib/audio/render";
import { claudeJson } from "@/lib/ai/claude";
import { checkClaims, coverArt, embed, researchFacts } from "@/lib/ai/gemini";
import { costStep, trackCosts } from "@/lib/ai/cost";
import { applyAliases, isOutOfCredits, music, soundEffect, speak } from "@/lib/ai/eleven";
import { NO_CREDITS, VOICE_CREDITS_MESSAGE } from "@/lib/stages";
import { CLAIMS_SCHEMA, FIX_SCHEMA, PRONOUNCE_SCHEMA, SAME_SCHEMA, SCRIPT_SCHEMA, TRIAGE_SCHEMA } from "@/lib/schemas";
import {
  CLAIMS_SYSTEM,
  PRONOUNCE_SYSTEM,
  RESEARCH_SYSTEM,
  SAME_QUESTION_SYSTEM,
  TRIAGE_SYSTEM,
  fixUser,
  researchQuestion,
  type PreviousEpisode,
  FIX_SYSTEM,
  introLines,
  outroLines,
  scriptSystem,
  scriptUser,
} from "@/lib/prompts";
import { bandForAge, type Band, type Category, type ChekoForm, type ClaimCheck, type Fact, type Script } from "@/lib/types";

type Triage = {
  verdict: "ok" | "needs_grownup" | "not_suitable" | "unclear";
  reason: string;
  question: string;
  category: Category;
  cheko_form: ChekoForm;
  kind: "question" | "journey";
};

type Kid = { id: string; family_id: string; name: string; name_say_as: string | null; age: number };

export async function triage(text: string, band: Band, journeyMode = false): Promise<Triage> {
  return claudeJson<Triage>({
    model: config.claudeFast,
    system: TRIAGE_SYSTEM,
    user: `Age band: ${band}${journeyMode ? "\nMode: the grown-up chose Journey (kind must be journey)" : ""}\nChild's question (from speech-to-text or a parent): "${text}"`,
    maxTokens: 4000,
    schema: TRIAGE_SCHEMA,
  });
}

/** Finds an existing episode that already answers this question. */
export async function findMatch(
  question: string,
  band: Band,
  familyId: string,
  bedtime = false,
  kind: "question" | "journey" = "question",
): Promise<{ episodeId: string; embedding: number[] } | { episodeId: null; embedding: number[] }> {
  const embedding = await embed(question);
  const { data } = await db().rpc("match_questions", {
    query_embedding: JSON.stringify(embedding),
    match_band: band,
    for_family: familyId,
    match_count: 3,
  });
  let candidates = ((data ?? []) as { episode_id: string; variant_text: string; similarity: number }[]).filter(
    (c) => c.similarity >= config.matchThreshold,
  );
  // Bedtime and daytime episodes answer the same question very differently, so they never stand in for each other.
  if (candidates.length) {
    // Journeys and questions are different kinds of episode too.
    const { data: modes } = await db().from("episodes").select("id, bedtime, kind").in("id", candidates.map((c) => c.episode_id));
    const mode = new Map((modes ?? []).map((m) => [m.id as string, `${Boolean(m.bedtime)}:${m.kind ?? "question"}`]));
    candidates = candidates.filter((c) => mode.get(c.episode_id) === `${bedtime}:${kind}`);
  }
  for (const c of candidates) {
    if (c.similarity > 0.97) return { episodeId: c.episode_id, embedding };
    const judge = await claudeJson<{ same: boolean }>({
      model: config.claudeFast,
      system: SAME_QUESTION_SYSTEM,
      user: `Question A: ${question}\nQuestion B: ${c.variant_text}`,
      maxTokens: 2000,
      schema: SAME_SCHEMA,
    });
    if (judge.same) return { episodeId: c.episode_id, embedding };
  }
  return { episodeId: null, embedding };
}

export async function newEpisodesThisMonth(familyId: string): Promise<number> {
  const { data } = await db().rpc("family_new_this_month", { fid: familyId });
  return (data as number) ?? 0;
}

async function setStage(episodeId: string, stage: string, extra: Record<string, unknown> = {}) {
  await db().from("episodes").update({ stage, updated_at: new Date().toISOString(), ...extra }).eq("id", episodeId);
}

async function upload(bucket: "shared" | "personal", path: string, bytes: Buffer, type: string) {
  const { error } = await db().storage.from(bucket).upload(path, bytes, { contentType: type, upsert: true });
  if (error) throw new Error(`Upload failed: ${error.message}`);
}

async function pronunciationRules(familyId: string | null) {
  const { data } = await db().from("pronunciations").select("word, alias, family_id");
  return (data ?? []).filter((r) => r.family_id === null || r.family_id === familyId) as {
    word: string;
    alias: string;
  }[];
}

async function inBatches<T>(items: T[], size: number, fn: (item: T, i: number) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map((item, j) => fn(item, i + j)));
  }
}

/**
 * Makes (or resumes) an episode: research -> script -> fact check (with fix loop) -> pronunciation -> voice + art.
 * Each finished step is saved, so a timed-out run can be resumed.
 */
export async function produceEpisode(episodeId: string): Promise<void> {
  const { error, tally } = await trackCosts(() => produceEpisodeRun(episodeId));
  if (tally.lines.length || tally.elevenChars) {
    const { data: row } = await db().from("episodes").select("cost_usd, cost_detail").eq("id", episodeId).maybeSingle();
    const detail = (row?.cost_detail as { lines?: unknown[]; eleven_chars?: number } | null) ?? {};
    const usd = tally.lines.reduce((s, l) => s + l.usd, 0);
    await db()
      .from("episodes")
      .update({
        cost_usd: Number(row?.cost_usd ?? 0) + usd,
        cost_detail: {
          lines: [...(detail.lines ?? []), ...tally.lines.map((l) => ({ ...l, usd: Math.round(l.usd * 10000) / 10000 }))].slice(-80),
          eleven_chars: (detail.eleven_chars ?? 0) + tally.elevenChars,
        },
      })
      .eq("id", episodeId);
  }
  if (error) throw error;
}

async function produceEpisodeRun(episodeId: string): Promise<void> {
  const { data: ep } = await db().from("episodes").select("*").eq("id", episodeId).single();
  if (!ep || ep.status === "ready") return;
  const band = ep.band as Band;
  const bedtime = Boolean(ep.bedtime);
  const journey = ep.kind === "journey";
  const previous = await previousEpisode(ep.parent_episode_id as string | null);
  const started = Date.now();
  // Functions stop at 5 minutes: past ~3, hand the rest to a fresh run.
  const outOfTime = () => Date.now() - started > 170_000;

  try {
    // 1. Research
    let facts = (ep.facts?.facts as Fact[] | undefined) ?? null;
    if (!facts) {
      await setStage(episodeId, "researching");
      costStep("research");
      // Gemini researches with Google Search (much cheaper); Claude's web search is the fallback.
      facts = await researchFacts(RESEARCH_SYSTEM, researchQuestion(ep.question, previous, journey), band).catch(async (e) => {
        console.error("Gemini research failed, using Claude", episodeId, e);
        const r = await claudeJson<{ facts: Fact[] }>({
          system: RESEARCH_SYSTEM,
          user: `Question from a child: ${researchQuestion(ep.question, previous, journey)}\nAge band: ${band}`,
          webSearch: true,
          maxTokens: 16000,
        });
        return r.facts;
      });
      if (!facts?.length) throw new Error("Research found no facts");
      await db().from("episodes").update({ facts: { facts, checks: [] } }).eq("id", episodeId);
    }

    if (outOfTime()) return continueLater(episodeId);

    // 2. Script + 3. Fact check with up to 2 fixes
    let script = ep.script as Script | null;
    let checks: ClaimCheck[] = (ep.facts?.checks as ClaimCheck[] | undefined) ?? [];
    if (ep.fact_status !== "passed") {
      if (!script) {
        await setStage(episodeId, "writing");
        costStep("script");
        script = await claudeJson<Script>({ system: scriptSystem(band, bedtime, journey), user: scriptUser(ep.question, facts, previous), maxTokens: 32000, schema: SCRIPT_SCHEMA });
        if (!scriptLooksComplete(script)) {
          console.error("script incomplete, writing again", episodeId);
          script = await claudeJson<Script>({ system: scriptSystem(band, bedtime, journey), user: scriptUser(ep.question, facts, previous), maxTokens: 32000, schema: SCRIPT_SCHEMA });
        }
        if (!scriptLooksComplete(script)) throw new Error("The script came back incomplete");
        await db().from("episodes").update({ script }).eq("id", episodeId);
        if (outOfTime()) return continueLater(episodeId);
      }
      for (let loop = 0; loop <= config.maxFixLoops; loop++) {
        if (loop > 0 && outOfTime()) {
          await db().from("episodes").update({ script }).eq("id", episodeId);
          return continueLater(episodeId);
        }
        await setStage(episodeId, loop === 0 ? "checking" : "fixing", { script });
        costStep(loop === 0 ? "fact check" : "fix");
        const { claims } = await claudeJson<{ claims: string[] }>({
          model: config.claudeFast,
          system: CLAIMS_SYSTEM,
          user: JSON.stringify({ segments: script.segments, grownup_fact: script.grownup_fact ?? null }),
          maxTokens: 8000,
          schema: CLAIMS_SCHEMA,
        });
        checks = await checkClaims(ep.question, claims);
        const problems = checks.filter((c) => c.verdict === "wrong" || c.verdict === "unsupported");
        if (problems.length === 0) break;
        if (loop === config.maxFixLoops) {
          await db()
            .from("episodes")
            .update({
              status: "needs_review",
              stage: "needs_review",
              fact_status: "failed",
              script,
              facts: { facts, checks },
              error: `${problems.length} claim(s) could not be confirmed`,
            })
            .eq("id", episodeId);
          await db().from("asks").update({ status: "failed" }).eq("episode_id", episodeId).eq("status", "generating");
          return;
        }
        const fix = await claudeJson<{ edits: { segment: number; lines: Script["segments"][number]["lines"]; answer: string | null }[]; grownup_fact: string | null }>({
          system: FIX_SYSTEM,
          user: fixUser(script, problems, facts),
          maxTokens: 12000,
          schema: FIX_SCHEMA,
        });
        script = applyFix(script, fix);
      }
      await db()
        .from("episodes")
        .update({
          script,
          facts: { facts, checks },
          fact_status: "passed",
          title: script.title,
          category: script.category,
          cheko_form: script.cheko_form,
          talk_about_it: script.talk_about_it,
        })
        .eq("id", episodeId);
    }
    if (!script) throw new Error("Script missing");

    if (outOfTime()) return continueLater(episodeId);

    // 4. Pronunciation
    await setStage(episodeId, "pronouncing");
    costStep("pronunciation");
    // Finding new tricky words is a nice-to-have: if it fails, the word list still applies.
    const { words } = await claudeJson<{ words: { word: string; alias: string }[] }>({
      model: config.claudeFast,
      system: PRONOUNCE_SYSTEM,
      user: script.segments.flatMap((s) => s.lines.map((l) => l.text)).join("\n"),
      maxTokens: 6000,
      schema: PRONOUNCE_SCHEMA,
    }).catch((e) => {
      console.error("pronunciation check skipped", episodeId, e);
      return { words: [] as { word: string; alias: string }[] };
    });
    // The global dictionary grows with new words (unapproved); existing entries are never overwritten.
    const known = new Set((await pronunciationRules(null)).map((r) => r.word.toLowerCase()));
    const fresh = words.filter(
      (w, i, all) => w.word && !known.has(w.word.toLowerCase()) && all.findIndex((x) => x.word.toLowerCase() === w.word.toLowerCase()) === i,
    );
    if (fresh.length) {
      await db().from("pronunciations").insert(fresh.map((w) => ({ family_id: null, word: w.word, alias: w.alias, approved: false })));
    }
    const rules = [...(await pronunciationRules(null)), ...words];

    // 5. Voice + art, in parallel
    await setStage(episodeId, "recording");
    costStep("art");
    if (!script.segments.some((sg) => sg.audio_path)) script.segments = splitTransforms(script.segments);
    const segments = script.segments;
    const rev = Date.now().toString(36);
    const voice = inBatches(segments, 2, async (seg, i) => {
      if (seg.audio_path || outOfTime()) return;
      const lines = seg.lines.map((l) => ({ speaker: l.speaker, text: applyAliases(l.text, rules) }));
      const bytes = await speak(lines);
      const path = `episodes/${episodeId}/${rev}-seg-${String(i).padStart(2, "0")}.mp3`;
      await upload("shared", path, bytes, "audio/mpeg");
      seg.audio_path = path;
      await db().from("episodes").update({ updated_at: new Date().toISOString() }).eq("id", episodeId);
    });
    const art = ep.art_path
      ? Promise.resolve(ep.art_path as string)
      : coverArt(
          bedtime
            ? `${script.art_prompt} A calm night-time scene: deep blue sky, moon and stars, soft warm glowing lights, sleepy and cosy.`
            : script.art_prompt,
        ).then(async (png) => {
          const path = `episodes/${episodeId}/cover-${Date.now().toString(36)}.png`;
          await upload("shared", path, png, "image/png");
          return path;
        });
    const [, artPath] = await Promise.all([
      voice,
      art.catch((e) => {
        console.error("cover art failed", episodeId, e);
        return null;
      }),
    ]);
    if (segments.some((sg) => !sg.audio_path)) {
      // Save the recorded segments and carry on in a fresh run.
      await db().from("episodes").update({ script: { ...script, segments }, art_path: artPath }).eq("id", episodeId);
      return continueLater(episodeId);
    }

    // 6. Sound design: ambience bed + spot effects (never blocks the episode)
    if (!script.sound_done) {
      if (outOfTime()) {
        await db().from("episodes").update({ script: { ...script, segments }, art_path: artPath }).eq("id", episodeId);
        return continueLater(episodeId);
      }
      await setStage(episodeId, "sound", { script: { ...script, segments }, art_path: artPath });
      await ensureKit().catch((e) => console.error("sound kit failed", e));
      const jobs: Promise<void>[] = [];
      if (script.ambience && !script.ambience_path) {
        jobs.push(
          soundEffect(
            `${script.ambience}. ${bedtime ? "Very quiet, sleepy night-time, slow and even, nothing sudden" : "Soft, calm"}, seamless background loop, no music, no voices`,
            22,
            true,
          )
            .then(async (b) => {
              const path = `episodes/${episodeId}/${rev}-ambience.mp3`;
              await upload("shared", path, b, "audio/mpeg");
              script!.ambience_path = path;
            })
            .catch((e) => console.error("ambience failed", episodeId, e)),
        );
      }
      const fxSegs = segments.map((sg, i) => ({ sg, i })).filter(({ sg }) => sg.fx && !sg.fx_path).slice(0, bedtime ? 2 : 6);
      jobs.push(
        inBatches(fxSegs, 2, async ({ sg, i }) => {
          try {
            const b = await soundEffect(bedtime ? `${sg.fx}, very soft and gentle, quiet, for a bedtime story, nothing sudden` : `${sg.fx}, friendly, for a children's show`, 2.5);
            const path = `episodes/${episodeId}/${rev}-fx-${String(i).padStart(2, "0")}.mp3`;
            await upload("shared", path, b, "audio/mpeg");
            sg.fx_path = path;
          } catch (e) {
            console.error("fx failed", episodeId, i, e);
          }
        }),
      );
      await Promise.all(jobs);
      script.sound_done = true;
    }

    // 7. Done (never mark an empty episode as ready)
    if (!scriptLooksComplete(script) || segments.some((sg) => !sg.audio_path)) throw new Error("Episode audio is incomplete");
    const { data: fam } = await db().from("families").select("is_admin").eq("id", ep.created_by_family).maybeSingle();
    await db()
      .from("episodes")
      .update({
        script: { ...script, segments },
        art_path: artPath,
        status: "ready",
        stage: "ready",
        shared: Boolean(fam?.is_admin),
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", episodeId);

    // Asks waiting on this episode: personal clips + library.
    const { data: asks } = await db().from("asks").select("*").eq("episode_id", episodeId).eq("status", "generating");
    for (const a of asks ?? []) await finishAsk(a.id, episodeId);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Out of voice credits: park it (the checked script is saved) until a grown-up tops up and taps Try again.
    if (isOutOfCredits(e)) await setStage(episodeId, NO_CREDITS, { error: VOICE_CREDITS_MESSAGE });
    else await setStage(episodeId, "error", { error: message.slice(0, 500) });
    throw e;
  }
}

/** What the kids learned in the episode a follow-up builds on. */
async function previousEpisode(id: string | null): Promise<PreviousEpisode | null> {
  if (!id) return null;
  const { data } = await db().from("episodes").select("title, question, script").eq("id", id).maybeSingle();
  const script = data?.script as Script | null;
  if (!data || !script) return null;
  const said = (beats: string[]) =>
    script.segments
      .filter((s) => beats.includes(s.beat))
      .flatMap((s) => s.lines.map((l) => l.text.replace(/\[[^\]]+\]\s*/g, "")))
      .join(" ");
  return { title: data.title ?? data.question, question: data.question, learned: said(["recap", "final_answer"]).slice(0, 1200) };
}

/** A real episode has a handful of segments, each with something said in it. */
export function scriptLooksComplete(script: Script | null | undefined): script is Script {
  const segs = script?.segments ?? [];
  return segs.length >= 5 && segs.every((sg) => sg.lines?.length && sg.lines.some((l) => l.text?.trim()));
}

/** Applies a fact-check fix to just the segments it names. */
function applyFix(
  script: Script,
  fix: { edits?: { segment: number; lines: Script["segments"][number]["lines"]; answer: string | null }[]; grownup_fact: string | null },
): Script {
  const segments = script.segments.map((sg) => ({ ...sg }));
  for (const e of fix.edits ?? []) {
    const seg = segments[e.segment];
    if (!seg || !e.lines?.length || !e.lines.some((l) => l.text?.trim())) continue;
    seg.lines = e.lines;
    if (e.answer !== null && e.answer !== undefined) seg.answer = e.answer;
    delete seg.audio_path;
  }
  return { ...script, segments, grownup_fact: fix.grownup_fact?.trim() ? fix.grownup_fact : script.grownup_fact };
}

/** Ends a segment on Cheko's "CHANGE-O!" so the transformation sound lands right after it. */
export function splitTransforms(segments: Script["segments"]): Script["segments"] {
  const out: Script["segments"] = [];
  for (const seg of segments) {
    const i = seg.lines.findIndex((l) => l.speaker === "cheko" && /change-?o/i.test(l.text));
    if (i < 0) {
      out.push(seg);
      continue;
    }
    const head = { ...seg, lines: seg.lines.slice(0, i + 1), transform_after: true, pause_after_s: 0, sfx: seg.sfx === "poof" ? null : seg.sfx };
    out.push(head);
    if (i < seg.lines.length - 1) out.push({ ...seg, lines: seg.lines.slice(i + 1), fx: null, fx_path: undefined, sfx: null, beat: seg.beat });
    else head.pause_after_s = seg.pause_after_s;
  }
  return out;
}

const KIT: Record<string, { prompt: string; seconds: number; music?: boolean }> = {
  theme: {
    prompt:
      "Upbeat, playful theme tune for a children's science podcast called What On Earth. Bouncy ukulele, glockenspiel, hand claps, " +
      "kazoo-like whistle hook, warm bass, sunny and curious. Big happy intro, ends on a clean final button",
    seconds: 12,
    music: true,
  },
  transform: {
    prompt: "Magical cartoon transformation: a quick rising sparkly swirl and spin, little twinkles, ending in a bright bubbly pop",
    seconds: 2,
  },
  whoosh: { prompt: "Quick light playful whoosh transition for a kids' cartoon, airy and soft", seconds: 1 },
  jingle: { prompt: "Short cheerful kids' show sting, ukulele and glockenspiel, bright and warm, ends on a happy note", seconds: 3 },
  ding: { prompt: "Soft friendly correct-answer chime, single bright ding", seconds: 1 },
  boing: { prompt: "Silly cartoon boing spring sound, gentle and funny", seconds: 1 },
  drumroll: { prompt: "Short soft snare drumroll building suspense, for kids, ends with a small cymbal tap", seconds: 2 },
  poof: { prompt: "Magical sparkle poof transformation sound with twinkles", seconds: 2 },
  "theme-night": {
    prompt:
      "Gentle lullaby version of a children's science podcast theme called What On Earth. Soft music box, celesta and warm felt piano, " +
      "slow and dreamy, hushed, like a starry night. Calm intro that settles into a soft final chord",
    seconds: 12,
    music: true,
  },
  "jingle-night": { prompt: "Very soft, slow lullaby sting, music box and warm felt piano, fades gently to silence", seconds: 4, music: true },
  "transform-night": { prompt: "Very soft magical shimmer, gentle twinkling chimes drifting down, quiet and dreamy", seconds: 2 },
};

/** Makes any missing shared sounds (theme tune and stings). Safe to call often. */
export async function ensureKit(force = false) {
  const { data } = await db().storage.from("shared").list("kit");
  const have = new Set((data ?? []).map((f) => f.name.replace(/\.mp3$/, "")));
  const made: string[] = [];
  for (const [name, k] of Object.entries(KIT)) {
    if (!force && have.has(name)) continue;
    const bytes = k.music ? await music(k.prompt, k.seconds * 1000) : await soundEffect(k.prompt, k.seconds);
    await upload("shared", `kit/${name}.mp3`, bytes, "audio/mpeg");
    made.push(name);
  }
  return made;
}

/** Starts a fresh function run to continue an episode (server-to-server, authorised by the service key). */
async function continueLater(episodeId: string) {
  await setStage(episodeId, "continuing");
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (!host) return;
  await fetch(`https://${host}/api/internal/continue`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-key": config.supabaseServiceKey },
    body: JSON.stringify({ episodeId }),
  }).catch((e) => console.error("continueLater failed", episodeId, e));
}

/** Links an ask to its (ready) episode: library row + personal clips for the asking kid. */
export async function finishAsk(askId: string, episodeId: string) {
  const { data: ask } = await db().from("asks").select("*").eq("id", askId).single();
  if (!ask) return;
  await db()
    .from("family_library")
    .upsert({ family_id: ask.family_id, episode_id: episodeId, kid_id: ask.kid_id }, { onConflict: "family_id,episode_id" });
  try {
    if (ask.for_all) {
      await ensureGroupClips(ask.family_id, episodeId, ask.created_new);
    } else if (ask.kid_id) {
      const { data: kid } = await db().from("kids").select("*").eq("id", ask.kid_id).single();
      if (kid) await ensurePersonalClips(kid as Kid, episodeId, ask.created_new);
    }
  } catch (e) {
    // The episode itself is done. The hello/goodbye clips are made again when it's played.
    if (!isOutOfCredits(e)) throw e;
    console.error("personal clips skipped: out of voice credits", episodeId);
  }
  await db().from("asks").update({ status: "ready" }).eq("id", askId);
  // Mix it now for whoever asked, so the first tap plays straight away instead of mixing then.
  await warmMix(ask.family_id as string, episodeId, ask.for_all ? "all" : (ask.kid_id as string | null), Boolean(ask.created_new)).catch((e) =>
    console.error("pre-mix failed (it will mix on first play)", episodeId, e),
  );
}

/** Builds the listener's mixed audio ahead of time, the same way the play route would. */
async function warmMix(familyId: string, episodeId: string, listener: string | null, askedByThem: boolean) {
  if (!listener) return;
  const { data: ep } = await db().from("episodes").select("script, bedtime, status").eq("id", episodeId).single();
  if (!ep || ep.status !== "ready") return;
  let clips: { intro_path: string | null; outro_path: string | null } | null = null;
  let hello = "";
  if (listener === "all") {
    clips = await ensureGroupClips(familyId, episodeId, askedByThem).catch(() => null);
    const { data: fk } = await db().from("kids").select("name").eq("family_id", familyId).order("created_at");
    hello = joinNames((fk ?? []).map((k) => k.name));
  } else {
    const { data: kid } = await db().from("kids").select("*").eq("id", listener).maybeSingle();
    if (!kid) return;
    clips = await ensurePersonalClips(kid as Kid, episodeId, askedByThem).catch(() => null);
    hello = kid.name;
  }
  await ensureMix({
    episodeId,
    script: ep.script as Script,
    listenerPath: `${familyId}/${listener}`,
    introPath: clips?.intro_path ?? null,
    outroPath: clips?.outro_path ?? null,
    hello,
    bedtime: Boolean(ep.bedtime),
  });
}

export async function ensurePersonalClips(kid: Kid, episodeId: string, askedByThem: boolean) {
  const { data: existing } = await db()
    .from("personal_clips")
    .select("*")
    .eq("kid_id", kid.id)
    .eq("episode_id", episodeId)
    .maybeSingle();
  const introPath = `${kid.family_id}/${kid.id}/${episodeId}-intro-v2.mp3`;
  const outroPath = `${kid.family_id}/${kid.id}/${episodeId}-outro-v2.mp3`;
  if (existing?.intro_path === introPath && existing?.outro_path) return existing;
  const name = kid.name_say_as || kid.name;
  const band: Band = bandForAge(kid.age);
  const bedtime = await isBedtime(episodeId);
  const rules = await pronunciationRules(kid.family_id);
  const say = (lines: { speaker: "otto" | "cheko"; text: string }[]) =>
    speak(lines.map((l) => ({ ...l, text: applyAliases(l.text, rules) })));
  const [intro, outro] = await Promise.all([say(introLines(name, band, askedByThem, bedtime)), say(outroLines(name, bedtime))]);
  await Promise.all([
    upload("personal", introPath, intro, "audio/mpeg"),
    upload("personal", outroPath, outro, "audio/mpeg"),
  ]);
  const row = { kid_id: kid.id, episode_id: episodeId, intro_path: introPath, outro_path: outroPath };
  await db().from("personal_clips").upsert(row, { onConflict: "kid_id,episode_id" });
  return row;
}

async function isBedtime(episodeId: string) {
  const { data } = await db().from("episodes").select("bedtime").eq("id", episodeId).maybeSingle();
  return Boolean(data?.bedtime);
}

export function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "friends";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** One intro/outro that names every kid in the family, for "All of us" listening. */
export async function ensureGroupClips(familyId: string, episodeId: string, askedByThem: boolean) {
  const introPath = `${familyId}/all/${episodeId}-intro-v2.mp3`;
  const outroPath = `${familyId}/all/${episodeId}-outro-v2.mp3`;
  const { data: existing } = await db().storage.from("personal").list(`${familyId}/all`, { search: `${episodeId}-` });
  const names = new Set((existing ?? []).map((f) => f.name));
  if (names.has(`${episodeId}-intro-v2.mp3`) && names.has(`${episodeId}-outro-v2.mp3`)) return { intro_path: introPath, outro_path: outroPath };

  const { data: kids } = await db().from("kids").select("*").eq("family_id", familyId).order("created_at");
  const list = (kids ?? []) as Kid[];
  const who = joinNames(list.map((k) => k.name_say_as || k.name));
  const band: Band = bandForAge(Math.min(...list.map((k) => k.age)));
  const bedtime = await isBedtime(episodeId);
  const rules = await pronunciationRules(familyId);
  const say = (lines: { speaker: "otto" | "cheko"; text: string }[]) =>
    speak(lines.map((l) => ({ ...l, text: applyAliases(l.text, rules) })));
  const [intro, outro] = await Promise.all([say(introLines(who, band, askedByThem, bedtime)), say(outroLines(who, bedtime))]);
  await Promise.all([
    upload("personal", introPath, intro, "audio/mpeg"),
    upload("personal", outroPath, outro, "audio/mpeg"),
  ]);
  return { intro_path: introPath, outro_path: outroPath };
}

/** Adds the new wording as a variant so future asks can match it. */
export async function addVariant(episodeId: string, text: string, band: Band, embedding: number[]) {
  await db()
    .from("question_variants")
    .insert({ episode_id: episodeId, text, band, embedding: JSON.stringify(embedding) });
}

export async function familyForEpisode(episodeId: string): Promise<Family | null> {
  const { data } = await db().from("episodes").select("created_by_family").eq("id", episodeId).single();
  if (!data?.created_by_family) return null;
  const { data: fam } = await db().from("families").select("*").eq("id", data.created_by_family).single();
  return fam as Family | null;
}

/**
 * Re-voices only the segments whose lines were edited after recording (marked "redo"),
 * so old episodes can be fixed without regenerating them. Returns how many are left.
 */
export async function rerecordEdited(budgetMs = 200_000): Promise<{ done: number; left: number }> {
  const started = Date.now();
  const { data } = await db().from("episodes").select("id, script").eq("status", "ready").contains("script", { segments: [{ redo: true }] });
  const eps = (data ?? []) as { id: string; script: Script }[];
  const rules = await pronunciationRules(null);
  let done = 0;
  for (const ep of eps) {
    if (Date.now() - started > budgetMs) break;
    const script = ep.script;
    const rev = Date.now().toString(36);
    try {
      await inBatches(script.segments, 2, async (seg, i) => {
      if (!seg.redo) return;
      const bytes = await speak(seg.lines.map((l) => ({ speaker: l.speaker, text: applyAliases(l.text, rules) })));
      const path = `episodes/${ep.id}/${rev}-seg-${String(i).padStart(2, "0")}.mp3`;
      await upload("shared", path, bytes, "audio/mpeg");
      seg.audio_path = path;
      delete seg.redo;
      done++;
      });
    } finally {
      // Keep whatever got recorded, even if the voice credits ran out part-way.
      await db().from("episodes").update({ script, updated_at: new Date().toISOString() }).eq("id", ep.id);
    }
  }
  return { done, left: await countEdited() };
}

export async function countEdited(): Promise<number> {
  const { data } = await db().from("episodes").select("script").eq("status", "ready").contains("script", { segments: [{ redo: true }] });
  return ((data ?? []) as { script: Script }[]).reduce((n, e) => n + e.script.segments.filter((s) => s.redo).length, 0);
}
