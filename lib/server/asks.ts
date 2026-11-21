import "server-only";
import { after } from "next/server";
import { db, type Family } from "@/lib/supabase/admin";
import { addVariant, findMatch, finishAsk, newEpisodesThisMonth, produceEpisode } from "@/lib/pipeline";
import type { Band } from "@/lib/types";

export type AskResult = { askId: string; status: string; episodeId?: string | null; reason?: string };

/** After triage (or parent approval): reuse a matching episode, or start a new one within the family's limit. */
export async function proceedAsk(opts: {
  askId: string;
  family: Family;
  question: string;
  band: Band;
  category?: string;
  chekoForm?: string;
  parentEpisodeId?: string | null;
  bedtime?: boolean;
  kind?: "question" | "journey";
}): Promise<AskResult> {
  const { askId, family, question, band } = opts;
  const bedtime = Boolean(opts.bedtime);
  const kind = opts.kind === "journey" ? "journey" : "question";
  const match = await findMatch(question, band, family.id, bedtime, kind);

  if (match.episodeId) {
    const { data: ep } = await db().from("episodes").select("id, status").eq("id", match.episodeId).single();
    const ready = ep?.status === "ready";
    await db()
      .from("asks")
      .update({ status: ready ? "matched" : "generating", episode_id: match.episodeId, created_new: false })
      .eq("id", askId);
    after(async () => {
      await addVariant(match.episodeId!, question, band, match.embedding);
      if (ready) await finishAsk(askId, match.episodeId!);
    });
    return { askId, status: ready ? "matched" : "generating", episodeId: match.episodeId };
  }

  const used = await newEpisodesThisMonth(family.id);
  if (!family.is_admin && used >= family.monthly_new_limit) {
    await db().from("asks").update({ status: "over_limit" }).eq("id", askId);
    return { askId, status: "over_limit", reason: `You've used all ${family.monthly_new_limit} new questions this month.` };
  }

  const { data: ep, error } = await db()
    .from("episodes")
    .insert({
      question,
      band,
      category: opts.category ?? null,
      cheko_form: opts.chekoForm ?? null,
      status: "generating",
      stage: "queued",
      created_by_family: family.id,
      parent_episode_id: opts.parentEpisodeId ?? null,
      bedtime,
      kind,
    })
    .select("id")
    .single();
  if (error || !ep) throw new Error(error?.message ?? "Could not create episode");

  await db().from("asks").update({ status: "generating", episode_id: ep.id, created_new: true }).eq("id", askId);
  after(async () => {
    await addVariant(ep.id, question, band, match.embedding);
    await produceEpisode(ep.id).catch((e) => console.error("produceEpisode failed", ep.id, e));
  });
  return { askId, status: "generating", episodeId: ep.id };
}
