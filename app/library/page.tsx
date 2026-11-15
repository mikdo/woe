"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { useFamily, useSession } from "@/lib/hooks";
import { CATEGORIES } from "@/lib/types";
import { EpisodeCard, type EpisodeLite } from "@/components/EpisodeCard";
import { Logo } from "@/components/Logo";

const FIELDS = "id, title, question, category, art_path, cheko_form, status";

export default function Library() {
  const { session } = useSession();
  const { kids } = useFamily(Boolean(session));
  const [tab, setTab] = useState<"ours" | "everyone">("ours");
  const [cat, setCat] = useState<string | null>(null);
  const [kidId, setKidId] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeLite[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!kidId && kids.length) setKidId(localStorage.getItem("woe-kid") ?? kids[0].id);
  }, [kids, kidId]);

  useEffect(() => {
    if (!session) return;
    (async () => {
      if (tab === "ours") {
        const { data } = await supabase().from("family_library").select(`favourite, episodes(${FIELDS})`).order("added_at", { ascending: false });
        setEpisodes(
          ((data ?? []) as unknown as { favourite: boolean; episodes: EpisodeLite }[])
            .map((r) => ({ ...r.episodes, favourite: r.favourite }))
            .filter((e) => e?.status === "ready"),
        );
      } else {
        const { data } = await supabase().from("episodes").select(FIELDS).eq("shared", true).eq("status", "ready").order("created_at", { ascending: false }).limit(200);
        setEpisodes((data ?? []) as EpisodeLite[]);
      }
    })();
  }, [session, tab]);

  const shown = episodes
    .filter((e) => !cat || e.category === cat)
    .sort((a, b) => Number(Boolean(b.favourite)) - Number(Boolean(a.favourite)));

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-5 p-6">
      <header className="flex items-center justify-between">
        <Link href="/" className="btn-soft px-4 py-2 text-base">← Home</Link>
        <Logo size={36} />
      </header>
      <h1 className="text-4xl font-bold">Library</h1>

      {kids.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-500">Listening:</span>
          {kids.map((k) => (
            <button
              key={k.id}
              className={`rounded-full px-4 py-1.5 font-display text-lg ${kidId === k.id ? "text-white" : "bg-white"}`}
              style={kidId === k.id ? { background: k.colour } : undefined}
              onClick={() => {
                setKidId(k.id);
                localStorage.setItem("woe-kid", k.id);
              }}
            >
              {k.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button className={`btn ${tab === "ours" ? "bg-ink text-white" : "bg-white"}`} onClick={() => setTab("ours")}>Ours</button>
        <button className={`btn ${tab === "everyone" ? "bg-ink text-white" : "bg-white"}`} onClick={() => setTab("everyone")}>🌏 Everyone&apos;s</button>
      </div>

      <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1">
        <button className={`shrink-0 rounded-full px-4 py-2 font-semibold ${!cat ? "bg-sun text-white" : "bg-white"}`} onClick={() => setCat(null)}>All</button>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            className="shrink-0 rounded-full px-4 py-2 font-semibold"
            style={cat === c.id ? { background: c.colour, color: "white" } : { background: "white" }}
            onClick={() => setCat(c.id)}
          >
            {c.emoji} {c.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="py-16 text-center text-lg text-slate-500">
          {tab === "ours" ? "No episodes yet. Ask Otto a question!" : "Nothing here yet."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {shown.map((e) => (
            <EpisodeCard key={e.id} episode={e} href={`/e/${e.id}${kidId ? `?kid=${kidId}` : ""}`} />
          ))}
        </div>
      )}
    </main>
  );
}
