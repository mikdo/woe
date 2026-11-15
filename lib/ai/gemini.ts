import "server-only";
import { GoogleGenAI } from "@google/genai";
import { config } from "@/lib/config";
import { extractJson } from "@/lib/ai/claude";
import type { ClaimCheck } from "@/lib/types";

let client: GoogleGenAI | null = null;
function gemini() {
  if (!client) client = new GoogleGenAI({ apiKey: config.geminiKey });
  return client;
}

/** 768-dim normalised embedding for question matching. */
export async function embed(text: string): Promise<number[]> {
  const res = await gemini().models.embedContent({
    model: config.geminiEmbedModel,
    contents: text,
    config: { outputDimensionality: 768, taskType: "SEMANTIC_SIMILARITY" },
  });
  const values = res.embeddings?.[0]?.values ?? [];
  const norm = Math.sqrt(values.reduce((s, v) => s + v * v, 0)) || 1;
  return values.map((v) => v / norm);
}

/** Independent fact check with Google Search grounding. */
export async function checkClaims(question: string, claims: string[]): Promise<ClaimCheck[]> {
  const prompt = `You are a careful fact checker for a science show for children aged 2-6.
The episode answers: "${question}".
Check EVERY claim below using Google Search. Children's simplifications are fine if they are not false.
Verdicts: "supported" (true as stated), "simplified_ok" (simplified for kids but not false),
"unsupported" (could not confirm), "wrong" (false or misleading).
Return ONLY JSON: {"checks":[{"claim":"...","verdict":"...","note":"one short sentence","source_url":"https://..."}]}

Claims:
${claims.map((c, i) => `${i + 1}. ${c}`).join("\n")}`;

  const res = await gemini().models.generateContent({
    model: config.geminiCheckModel,
    contents: prompt,
    config: { tools: [{ googleSearch: {} }], temperature: 0 },
  });
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
  const res = await gemini().models.generateContent({
    model: config.geminiImageModel,
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
  });
  const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) throw new Error("No image returned");
  return Buffer.from(part.inlineData.data, "base64");
}
