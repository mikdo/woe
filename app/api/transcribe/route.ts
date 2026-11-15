import { requireFamily } from "@/lib/supabase/admin";
import { transcribe } from "@/lib/ai/eleven";

export const maxDuration = 60;

/** Speech to text for a kid's question. The recording is discarded straight after. */
export async function POST(req: Request) {
  const auth = await requireFamily(req);
  if (auth instanceof Response) return auth;
  const form = await req.formData();
  const file = form.get("audio");
  if (!(file instanceof Blob) || file.size === 0) return Response.json({ error: "No audio" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return Response.json({ error: "Too long" }, { status: 413 });
  try {
    const text = await transcribe(file);
    return Response.json({ text });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not hear that" }, { status: 502 });
  }
}
