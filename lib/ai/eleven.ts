import "server-only";
import { config } from "@/lib/config";
import type { Speaker } from "@/lib/types";

const BASE = "https://api.elevenlabs.io/v1";

function voiceFor(s: Speaker) {
  return s === "cheko" ? config.chekoVoiceId : config.ottoVoiceId;
}

/** Applies alias pronunciation rules (whole words, case-insensitive). */
export function applyAliases(text: string, rules: { word: string; alias: string }[]): string {
  let out = text;
  for (const r of rules) {
    // Capitals make the voice spell words out ("OWT" -> "O-U-T"), so respellings are kept lower case.
    const alias = r.alias.replace(/[A-Z]{2,}/g, (m) => m.toLowerCase());
    const esc = r.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\b${esc}\\b`, "gi"), alias);
  }
  return out;
}

/** Speaks a list of lines (one or two voices) as one MP3 clip. */
export async function speak(lines: { speaker: Speaker; text: string }[]): Promise<Buffer> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await speakOnce(lines);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (attempt >= 5 || !/\b(409|429|500|502|503|504)\b/.test(m)) throw e;
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1) + Math.random() * 2000));
    }
  }
}

async function speakOnce(lines: { speaker: Speaker; text: string }[]): Promise<Buffer> {
  const res = await fetch(`${BASE}/text-to-dialogue?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": config.elevenKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model_id: config.elevenModel,
      inputs: lines.map((l) => ({ text: l.text, voice_id: voiceFor(l.speaker) })),
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs speech failed: ${res.status} ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

async function withEleven<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (attempt >= 4 || !/\b(409|429|500|502|503|504)\b/.test(m)) throw e;
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1) + Math.random() * 2000));
    }
  }
}

export async function soundEffect(text: string, seconds: number, loop = false): Promise<Buffer> {
  return withEleven(async () => {
    const res = await fetch(`${BASE}/sound-generation`, {
      method: "POST",
      headers: { "xi-api-key": config.elevenKey, "Content-Type": "application/json" },
      body: JSON.stringify({ text, duration_seconds: seconds, prompt_influence: 0.6, loop }),
    });
    if (!res.ok) throw new Error(`ElevenLabs sound failed: ${res.status} ${await res.text()}`);
    return Buffer.from(await res.arrayBuffer());
  });
}

/** Instrumental music (theme tune). Tries the newest music model, then the default. */
export async function music(prompt: string, ms: number): Promise<Buffer> {
  let last: unknown;
  for (const model of ["music_v2_5", "music_v2", undefined]) {
    try {
      return await withEleven(async () => {
        const res = await fetch(`${BASE}/music`, {
          method: "POST",
          headers: { "xi-api-key": config.elevenKey, "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, music_length_ms: ms, force_instrumental: true, ...(model ? { model_id: model } : {}) }),
        });
        if (!res.ok) throw new Error(`ElevenLabs music failed: ${res.status} ${await res.text()}`);
        return Buffer.from(await res.arrayBuffer());
      });
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

/** Speech to text. The audio is never stored. */
export async function transcribe(file: Blob): Promise<string> {
  const ext = file.type.includes("mp4") ? "m4a" : file.type.includes("ogg") ? "ogg" : "webm";
  const form = new FormData();
  form.append("file", file, `question.${ext}`);
  form.append("model_id", config.elevenSttModel);
  form.append("language_code", "en");
  form.append("tag_audio_events", "false");
  const res = await fetch(`${BASE}/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": config.elevenKey },
    body: form,
  });
  if (!res.ok) throw new Error(`ElevenLabs transcription failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { text?: string };
  return (json.text ?? "").trim();
}
