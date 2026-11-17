import { requireFamily } from "@/lib/supabase/admin";
import { elevenErrorResponse, speak } from "@/lib/ai/eleven";

export const maxDuration = 60;

/** Otto says a kid's name, so a parent can check it sounds right. */
export async function POST(req: Request) {
  const auth = await requireFamily(req);
  if (auth instanceof Response) return auth;
  const { name } = (await req.json()) as { name?: string };
  const clean = (name ?? "").trim().slice(0, 40);
  if (!clean) return Response.json({ error: "No name" }, { status: 400 });
  try {
    const audio = await speak([{ speaker: "otto", text: `Hey hey, ${clean}! I'm Otto. Nice to meet you!` }]);
    return new Response(new Uint8Array(audio), { headers: { "Content-Type": "audio/mpeg" } });
  } catch (e) {
    return elevenErrorResponse(e, "Voice failed");
  }
}
