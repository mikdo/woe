import { requireFamily } from "@/lib/supabase/admin";
import { elevenErrorResponse, transcribe } from "@/lib/ai/eleven";
import { claudeJson } from "@/lib/ai/claude";
import { config } from "@/lib/config";
import { TIDY_SYSTEM } from "@/lib/prompts";
import { TIDY_SCHEMA } from "@/lib/schemas";

export const maxDuration = 60;

/**
 * Speech to text for a kid's question, then 1-3 tidy versions of it for a grown-up to pick from
 * ("um, why do, um dinosaurs, like volcanoes" -> "Did volcanoes hurt the dinosaurs?").
 * The recording is discarded straight after.
 */
export async function POST(req: Request) {
  const auth = await requireFamily(req);
  if (auth instanceof Response) return auth;
  const form = await req.formData();
  const file = form.get("audio");
  const journey = form.get("kind") === "journey";
  if (!(file instanceof Blob) || file.size === 0) return Response.json({ error: "No audio" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return Response.json({ error: "Too long" }, { status: 413 });
  let text: string;
  try {
    text = (await transcribe(file)).trim();
  } catch (e) {
    return elevenErrorResponse(e, "Could not hear that");
  }
  let options: string[] = [];
  if (text) {
    try {
      const r = await claudeJson<{ options: string[] }>({ model: config.claudeFast, system: TIDY_SYSTEM, user: journey ? `JOURNEY MODE\n${text}` : text, maxTokens: 1500, schema: TIDY_SCHEMA });
      options = (r.options ?? []).map((o) => o.trim()).filter(Boolean).slice(0, 3);
    } catch (e) {
      console.error("tidy failed", e);
    }
  }
  return Response.json({ text, options: options.length ? options : text ? [text] : [] });
}
