import "server-only";
import { config } from "@/lib/config";
import { db, type Family } from "@/lib/supabase/admin";
import { claudeJson } from "@/lib/ai/claude";
import { checkClaims, embed, makeArt } from "@/lib/ai/gemini";
import { applyAliases, music, soundEffect, speak } from "@/lib/ai/eleven";
import { CLAIMS_SCHEMA, PRONOUNCE_SCHEMA, SAME_SCHEMA, SCRIPT_SCHEMA, TRIAGE_SCHEMA } from "@/lib/schemas";
import {
  CLAIMS_SYSTEM,
  PRONOUNCE_SYSTEM,
  RESEARCH_SYSTEM,
  SAME_QUESTION_SYSTEM,
  TRIAGE_SYSTEM,
  fixUser,
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
};

type Kid = { id: string; family_id: string; name: string; name_say_as: string | null; age: number };

export async function triage(text: string, band: Band): Promise<Triage> {
  return claudeJson<Triage>({
    model: config.claudeFast,
    system: TRIAGE_SYSTEM,
    user: `Age band: ${band}\nChild's question (from speech-to-text or a parent): "${text}"`,
    maxTokens: 4000,
    schema: TRIAGE_SCHEMA,
  });
}

/** Finds an existing episode that already answers this question. */
export async function findMatch(
  question: string,
  band: Band,
  familyId: string,
): Promise<{ episodeId: string; embedding: number[] } | { episodeId: null; embedding: number[] }> {
  const embedding = await embed(question);
  const { data } = await db().rpc("match_questions", {
    query_embedding: JSON.stringify(embedding),
    match_band: band,
    for_family: familyId,
    match_count: 3,
  });
  const candidates = ((data ?? []) as { episode_id: string; variant_text: string; similarity: number }[]).filter(
    (c) => c.similarity >= config.matchThreshold,
  );
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
  const { data: ep } = await db().from("episodes").select("*").eq("id", episodeId).single();
  if (!ep || ep.status === "ready") return;
  const band = ep.band as Band;
  const started = Date.now();
  // Functions stop at 5 minutes: past ~3, hand the rest to a fresh run.
  const outOfTime = () => Date.now() - started > 170_000;

  try {
    // 1. Research
    let facts = (ep.facts?.facts as Fact[] | undefined) ?? null;
    if (!facts) {
      await setStage(episodeId, "researching");
      const r = await claudeJson<{ facts: Fact[] }>({
        system: RESEARCH_SYSTEM,
        user: `Question from a child: ${ep.question}\nAge band: ${band}`,
        webSearch: true,
        maxTokens: 16000,
      });
      facts = r.facts;
      await db().from("episodes").update({ facts: { facts, checks: [] } }).eq("id", episodeId);
    }

    if (outOfTime()) return continueLater(episodeId);

    // 2. Script + 3. Fact check with up to 2 fixes
    let script = ep.script as Script | null;
    let checks: ClaimCheck[] = (ep.facts?.checks as ClaimCheck[] | undefined) ?? [];
    if (ep.fact_status !== "passed") {
      if (!script) {
        await setStage(episodeId, "writing");
        script = await claudeJson<Script>({ system: scriptSystem(band), user: scriptUser(ep.question, facts), maxTokens: 32000, schema: SCRIPT_SCHEMA });
        await db().from("episodes").update({ script }).eq("id", episodeId);
        if (outOfTime()) return continueLater(episodeId);
      }
      for (let loop = 0; loop <= config.maxFixLoops; loop++) {
        if (loop > 0 && outOfTime()) {
          await db().from("episodes").update({ script }).eq("id", episodeId);
          return continueLater(episodeId);
        }
        await setStage(episodeId, loop === 0 ? "checking" : "fixing", { script });
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
        script = await claudeJson<Script>({ system: scriptSystem(band), user: fixUser(script, problems, facts), maxTokens: 32000, schema: SCRIPT_SCHEMA });
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
    const { words } = await claudeJson<{ words: { word: string; alias: string }[] }>({
      model: config.claudeFast,
      system: PRONOUNCE_SYSTEM,
      user: script.segments.flatMap((s) => s.lines.map((l) => l.text)).join("\n"),
      maxTokens: 6000,
      schema: PRONOUNCE_SCHEMA,
    });
    // The global dictionary grows with new words (unapproved); existing entries are never overwritten.
    const known = new Set((await pronunciationRules(null)).map((r) => r.word.toLowerCase()));
    const fresh = [...words, ...script.new_words.map((n) => ({ word: n.word, alias: n.say_as }))].filter(
      (w, i, all) => w.word && !known.has(w.word.toLowerCase()) && all.findIndex((x) => x.word.toLowerCase() === w.word.toLowerCase()) === i,
    );
    if (fresh.length) {
      await db().from("pronunciations").insert(fresh.map((w) => ({ family_id: null, word: w.word, alias: w.alias, approved: false })));
    }
    const rules = [...(await pronunciationRules(null)), ...words];

    // 5. Voice + art, in parallel
    await setStage(episodeId, "recording");
    const segments = script.segments;
    const rev = Date.now().toString(36);
    const voice = inBatches(segments, 2, async (seg, i) => {
      if (seg.audio_path || outOfTime()) return;
      const lines = seg.lines.map((l) => ({ speaker: l.speaker, text: applyAliases(l.text, rules) }));
      const bytes = await speak(lines);
      const path = `episodes/${episodeId}/${rev}-seg-${String(i).padStart(2, "0")}.mp3`;
      await upload("shared", path, bytes, "audio/mpeg");
      seg.audio_path = path;
    });
    const art = ep.art_path
      ? Promise.resolve(ep.art_path as string)
      : makeArt(script.art_prompt).then(async (png) => {
          const path = `episodes/${episodeId}/cover.png`;
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
          soundEffect(`${script.ambience}. Soft, calm, seamless background loop, no music, no voices`, 22, true)
            .then(async (b) => {
              const path = `episodes/${episodeId}/${rev}-ambience.mp3`;
              await upload("shared", path, b, "audio/mpeg");
              script!.ambience_path = path;
            })
            .catch((e) => console.error("ambience failed", episodeId, e)),
        );
      }
      const fxSegs = segments.map((sg, i) => ({ sg, i })).filter(({ sg }) => sg.fx && !sg.fx_path).slice(0, 6);
      jobs.push(
        inBatches(fxSegs, 2, async ({ sg, i }) => {
          try {
            const b = await soundEffect(`${sg.fx}, friendly, for a children's show`, 2.5);
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

    // 7. Done
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
    await setStage(episodeId, "error", { error: message.slice(0, 500) });
    throw e;
  }
}

const KIT: Record<string, { prompt: string; seconds: number; music?: boolean }> = {
  theme: {
    prompt:
      "Upbeat, playful theme tune for a children's science podcast called What On Earth. Bouncy ukulele, glockenspiel, hand claps, " +
      "kazoo-like whistle hook, warm bass, sunny and curious. Big happy intro, ends on a clean final button",
    seconds: 12,
    music: true,
  },
  jingle: { prompt: "Short cheerful kids' show sting, ukulele and glockenspiel, bright and warm, ends on a happy note", seconds: 3 },
  ding: { prompt: "Soft friendly correct-answer chime, single bright ding", seconds: 1 },
  boing: { prompt: "Silly cartoon boing spring sound, gentle and funny", seconds: 1 },
  drumroll: { prompt: "Short soft snare drumroll building suspense, for kids, ends with a small cymbal tap", seconds: 2 },
  poof: { prompt: "Magical sparkle poof transformation sound with twinkles", seconds: 2 },
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
  if (ask.for_all) {
    await ensureGroupClips(ask.family_id, episodeId, ask.created_new);
  } else if (ask.kid_id) {
    const { data: kid } = await db().from("kids").select("*").eq("id", ask.kid_id).single();
    if (kid) await ensurePersonalClips(kid as Kid, episodeId, ask.created_new);
  }
  await db().from("asks").update({ status: "ready" }).eq("id", askId);
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
  const rules = await pronunciationRules(kid.family_id);
  const say = (lines: { speaker: "otto" | "cheko"; text: string }[]) =>
    speak(lines.map((l) => ({ ...l, text: applyAliases(l.text, rules) })));
  const [intro, outro] = await Promise.all([say(introLines(name, band, askedByThem)), say(outroLines(name))]);
  await Promise.all([
    upload("personal", introPath, intro, "audio/mpeg"),
    upload("personal", outroPath, outro, "audio/mpeg"),
  ]);
  const row = { kid_id: kid.id, episode_id: episodeId, intro_path: introPath, outro_path: outroPath };
  await db().from("personal_clips").upsert(row, { onConflict: "kid_id,episode_id" });
  return row;
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
  const rules = await pronunciationRules(familyId);
  const say = (lines: { speaker: "otto" | "cheko"; text: string }[]) =>
    speak(lines.map((l) => ({ ...l, text: applyAliases(l.text, rules) })));
  const [intro, outro] = await Promise.all([say(introLines(who, band, askedByThem)), say(outroLines(who))]);
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
