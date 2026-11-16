import "server-only";
import { GoogleGenAI } from "@google/genai";
import { config } from "@/lib/config";
import { extractJson } from "@/lib/ai/claude";
import type { ClaimCheck } from "@/lib/types";

let client: GoogleGenAI | null = null;

const FALLBACK_CHECK_MODELS = ["gemini-3.6-flash", "gemini-3-flash-preview"];

function retryable(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  return /\b(429|500|502|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded|timeout/i.test(m);
}

/** Retries busy/overloaded errors with backoff, then tries fallback models. */
async function withRetry<T>(models: string[], fn: (model: string) => Promise<T>): Promise<T> {
  let last: unknown;
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
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
  if (!client) client = new GoogleGenAI({ apiKey: config.geminiKey });
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
  const res = await withRetry(models, (model) =>
    gemini().models.generateContent({
      model,
      contents: prompt,
      config: { tools: [{ googleSearch: {} }], temperature: 0 },
    }),
  );
  const parsed = extractJson<{ checks: ClaimCheck[] }>(res.text ?? "");
  const sources = (res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
    .map((c) => c.web?.uri)
    .filter(Boolean) as string[];
  return parsed.checks.map((c, i) => ({ ...c, source_url: c.source_url || sources[i] || sources[0] }));
}

/** Square picture-book cover art. Returns PNG bytes. */
export async function makeArt(prompt: string, styleRefs: { mimeType: string; data: string }[] = []): Promise<Buffer> {
  const style =
    "Friendly picture-book illustration for toddlers, soft hand-drawn texture, warm bright colours, simple shapes, " +
    "lots of space, no text, no letters, no real people, no logos or brand characters.";
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
  if (!part?.inlineData?.data) throw new Error("No image returned");
  return Buffer.from(part.inlineData.data, "base64");
}
