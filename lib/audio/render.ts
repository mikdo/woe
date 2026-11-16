import "server-only";
import { db } from "@/lib/supabase/admin";
import type { Script, Segment } from "@/lib/types";
import { Bus, decode, encode, trim } from "./mix";

export type Cue = { start: number; end: number; caption: string; kind: string; think?: boolean };
export type Mix = { path: string; duration: number; cues: Cue[] };

const MIX_VERSION = "m3";
const GAP = 0.28; // between segments
const THEME_GAIN = 0.8;
const FX_GAIN = 0.55;
const STING_GAIN = 0.7;
const BED_GAIN = 0.085;
// Beats that open a new part of the show get a little whoosh.
const WHOOSH_BEFORE = new Set(["framing", "recap", "final_answer", "teaser", "signoff"]);

function caption(text: string) {
  return text.replace(/\[[^\]]+\]\s*/g, "").trim();
}

async function fetchFile(bucket: "shared" | "personal", path: string): Promise<Buffer | null> {
  const { data, error } = await db().storage.from(bucket).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

async function load(bucket: "shared" | "personal", path: string | null | undefined, doTrim = true) {
  if (!path) return null;
  const file = await fetchFile(bucket, path);
  if (!file) return null;
  const pcm = await decode(file).catch(() => null);
  return pcm && doTrim ? trim(pcm) : pcm;
}

/** Thinking pauses only after a real question to the child, and never long. */
export function pauseFor(seg: Segment) {
  const last = seg.lines[seg.lines.length - 1]?.text.trim() ?? "";
  if (!seg.pause_after_s || !/\?["”)]*$/.test(last)) return 0;
  return Math.min(seg.pause_after_s, 2.5);
}

/**
 * One finished audio file for a listener: theme, Otto's hello, the personal intro,
 * the episode with effects and thinking pauses, the personal goodbye and a closing sting,
 * all over a quiet ambience bed. Cached per listener and recording.
 */
export async function ensureMix(opts: {
  episodeId: string;
  script: Script;
  listenerPath: string; // e.g. "<family>/<kid or all>"
  introPath: string | null;
  outroPath: string | null;
  hello: string;
}): Promise<Mix> {
  const { episodeId, script, listenerPath } = opts;
  const segs = script.segments.filter((s) => s.audio_path);
  const rev = (segs[0]?.audio_path ?? "").split("/").pop()?.split("-")[0] ?? "x";
  const base = `${listenerPath}/${episodeId}-${MIX_VERSION}-${rev}${opts.introPath ? "" : "-plain"}`;
  const cached = await fetchFile("personal", `${base}.json`);
  if (cached) return JSON.parse(cached.toString()) as Mix;

  const kitNames = ["theme", "jingle", "ding", "boing", "drumroll", "poof", "transform", "whoosh"];
  const [kitList, intro, outro, bed, ...voices] = await Promise.all([
    Promise.all(kitNames.map((k) => load("shared", `kit/${k}.mp3`, k !== "theme"))),
    load("personal", opts.introPath),
    load("personal", opts.outroPath),
    load("shared", script.ambience_path, false),
    ...segs.map((s) => load("shared", s.audio_path)),
  ]);
  const kit = Object.fromEntries(kitNames.map((k, i) => [k, kitList[i]]));
  const fxs = await Promise.all(segs.map((s) => load("shared", s.fx_path)));

  const bus = new Bus();
  const cues: Cue[] = [];
  let t = 0.2;

  // Theme, with Otto coming in over its last moment.
  let bedFrom = 0;
  if (kit.theme) {
    const end = bus.add(kit.theme, t, THEME_GAIN);
    cues.push({ start: t, end, caption: "🎵 What On Earth!", kind: "theme" });
    t = Math.max(t + 1, end - 0.9);
    bedFrom = end - 2;
  }

  const voice = (clip: Float32Array | null, cap: string, kind: string) => {
    if (!clip) return;
    const end = bus.add(clip, t, 1);
    cues.push({ start: t, end, caption: cap, kind });
    t = end + GAP;
  };
  const sting = (name: string, gain = STING_GAIN, overlap = 0.15) => {
    const clip = kit[name];
    if (!clip) return;
    const end = bus.add(clip, t, gain);
    t = Math.max(t, end - overlap);
  };
  const segCaption = (s: Segment) => s.lines.map((l) => `${l.speaker === "otto" ? "Otto" : "Cheko"}: ${caption(l.text)}`).join("\n");

  let firstGame = true;
  segs.forEach((seg, i) => {
    // The personal intro goes straight after Otto's hello.
    if (i === 1 && segs[0].beat === "hello" && intro) voice(intro, `Today's question, ${opts.hello}!`, "intro");
    if (i === 0 && seg.beat !== "hello" && intro) voice(intro, `Today's question, ${opts.hello}!`, "intro");

    const isGame = seg.beat.startsWith("game");
    if (WHOOSH_BEFORE.has(seg.beat) || (isGame && firstGame)) sting("whoosh", 0.5, 0.25);
    if (isGame) firstGame = false;
    if (seg.sfx && ["drumroll", "ding", "boing"].includes(seg.sfx)) sting(seg.sfx);

    const fx = fxs[i];
    if (fx) {
      const lead = Math.min(fx.length / 44100 * 0.45, 1.2);
      bus.add(fx, t, FX_GAIN);
      t += lead;
    }
    voice(voices[i], segCaption(seg), seg.beat);
    if (seg.transform_after) sting("transform", 0.75, 0.35);

    const pause = pauseFor(seg);
    if (pause > 0) {
      cues.push({ start: t - GAP, end: t - GAP + pause, caption: "🤔 What do you think?", kind: "think", think: true });
      t += pause;
    }
  });

  voice(outro, `Bye, ${opts.hello}!`, "outro");
  sting("jingle", 0.75, 0);
  bus.extend(t + 0.6);
  if (bed) bus.bed(bed, Math.max(0, bedFrom), t - 0.2, BED_GAIN, 2.5);

  const mp3 = await encode(bus.out());
  const mix: Mix = { path: `${base}.mp3`, duration: bus.length / 44100, cues };
  await db().storage.from("personal").upload(`${base}.mp3`, mp3, { contentType: "audio/mpeg", upsert: true });
  await db().storage.from("personal").upload(`${base}.json`, Buffer.from(JSON.stringify(mix)), { contentType: "application/json", upsert: true });
  return mix;
}
