import "server-only";
import { GoogleGenAI } from "@google/genai";
import { config } from "@/lib/config";
import { extractJson } from "@/lib/ai/claude";
import type { ClaimCheck, Fact } from "@/lib/types";
import { addImage, addTokens } from "@/lib/ai/cost";

type Usage = { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } | undefined;
function track(model: string, u: Usage) {
  addTokens(model, { in: u?.promptTokenCount ?? 0, out: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0) });
}

let client: GoogleGenAI | null = null;

const FALLBACK_CHECK_MODELS = ["gemini-3.6-flash"];

function retryable(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  return /\b(429|500|502|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded|timeout|timed out|aborted/i.test(m);
}

/** Retries busy/overloaded errors with backoff, then tries fallback models. */
async function withRetry<T>(models: string[], fn: (model: string) => Promise<T>): Promise<T> {
  let last: unknown;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await fn(model);
      } catch (e) {
        last = e;
        if (!retryable(e)) throw e;
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1) + Math.random() * 1000));
      }
    }
  }
  throw last;
}
function gemini() {
  if (!client) client = new GoogleGenAI({ apiKey: config.geminiKey, httpOptions: { timeout: 60_000 } });
  return client;
}

/** 768-dim normalised embedding for question matching. */
export async function embed(text: string): Promise<number[]> {
  const res = await withRetry([config.geminiEmbedModel], (model) =>
    gemini().models.embedContent({
      model,
      contents: text,
      config: { outputDimensionality: 768, taskType: "SEMANTIC_SIMILARITY" },
    }),
  );
  const values = res.embeddings?.[0]?.values ?? [];
  const norm = Math.sqrt(values.reduce((s, v) => s + v * v, 0)) || 1;
  return values.map((v) => v / norm);
}

/** Independent fact check with Google Search grounding. */
export async function checkClaims(question: string, claims: string[]): Promise<ClaimCheck[]> {
  const prompt = `You are a careful fact checker for a science show for children aged 2-10.
The episode answers: "${question}".
Check EVERY claim below using Google Search. Children's simplifications are fine if they are not false.
Verdicts: "supported" (true as stated), "simplified_ok" (simplified for kids but not false),
"unsupported" (could not confirm), "wrong" (false or misleading).
Return ONLY JSON: {"checks":[{"claim":"...","verdict":"...","note":"one short sentence","source_url":"https://..."}]}

Claims:
${claims.map((c, i) => `${i + 1}. ${c}`).join("\n")}`;

  const models = [config.geminiCheckModel, ...FALLBACK_CHECK_MODELS.filter((m) => m !== config.geminiCheckModel)];
  let used = models[0];
  const res = await withRetry(models, (model) => {
    used = model;
    return gemini().models.generateContent({
      model,
      contents: prompt,
      config: { tools: [{ googleSearch: {} }], temperature: 0 },
    });
  });
  track(used, res.usageMetadata);
  const parsed = extractJson<{ checks: ClaimCheck[] }>(res.text ?? "");
  const sources = (res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
    .map((c) => c.web?.uri)
    .filter(Boolean) as string[];
  return parsed.checks.map((c, i) => ({ ...c, source_url: c.source_url || sources[i] || sources[0] }));
}

/**
 * Research with Google Search grounding: 6-10 checkable facts, each with a source.
 * Sources come from the pages Google actually returned.
 */
export async function researchFacts(system: string, question: string, band: string): Promise<Fact[]> {
  const models = [config.geminiCheckModel, ...FALLBACK_CHECK_MODELS.filter((m) => m !== config.geminiCheckModel)];
  let used = models[0];
  const res = await withRetry(models, (model) => {
    used = model;
    return gemini().models.generateContent({
      model,
      contents: `${system}\n\nQuestion from a child: ${question}\nAge band: ${band}\n\nReturn ONLY the JSON.`,
      config: { tools: [{ googleSearch: {} }], temperature: 0.2 },
    });
  });
  track(used, res.usageMetadata);
  const parsed = extractJson<{ facts: Fact[] }>(res.text ?? "");
  const chunks = (res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
    .map((c) => ({ uri: c.web?.uri ?? "", title: c.web?.title ?? "" }))
    .filter((c) => c.uri);
  // Prefer a real source per fact: use the grounding support that covers it, else the model's own URL, else the first source.
  const supports = res.candidates?.[0]?.groundingMetadata?.groundingSupports ?? [];
  const facts = (parsed.facts ?? []).filter((f) => f?.fact).slice(0, 10);
  return facts.map((f, i) => {
    const sup = supports.find((s) => s.segment?.text && f.fact.includes(s.segment.text.slice(0, 40)));
    const chunk = sup?.groundingChunkIndices?.length ? chunks[sup.groundingChunkIndices[0]] : undefined;
    const fallback = chunks[i % Math.max(1, chunks.length)];
    const url = chunk?.uri ?? (f.source_url?.startsWith("http") ? f.source_url : fallback?.uri ?? "");
    return { id: f.id || `F${i + 1}`, fact: f.fact, source_url: url, source_title: f.source_title || chunk?.title || fallback?.title };
  });
}

/** Square picture-book cover art. Returns PNG bytes. */
export async function makeArt(prompt: string, styleRefs: { mimeType: string; data: string }[] = [], styleOverride?: string): Promise<Buffer> {
  const style = styleOverride ??
    "Friendly picture-book illustration for toddlers, soft hand-drawn texture, warm bright colours, simple shapes, " +
    "lots of space, no text, no letters, no real people, no logos or brand characters. " +
    "Find-Cheko game: hide Cheko somewhere in the scene, small but findable by a 4 year old (peeking from behind something, " +
    "tucked in a corner, up high): a cute little brown stuffed-toy otter with a round face, wearing the costume or form from the scene " +
    "(e.g. bee stripes and wings, a space helmet). Don't put him in the centre.";
  const res = await withRetry([config.geminiImageModel], (model) => gemini().models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          ...styleRefs.map((r) => ({ inlineData: r })),
          { text: `${style}\n\nScene: ${prompt}` },
        ],
      },
    ],
    config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "1:1" } },
  }));
  const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) {
    const c = res.candidates?.[0];
    const said = c?.content?.parts?.map((p) => p.text).filter(Boolean).join(" ").slice(0, 300);
    throw new Error(`No image returned (${c?.finishReason ?? res.promptFeedback?.blockReason ?? "unknown"}${said ? `: ${said}` : ""})`);
  }
  addImage(config.geminiImageModel);
  return Buffer.from(part.inlineData.data, "base64");
}
