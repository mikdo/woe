"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, supabase } from "@/lib/supabase/browser";
import { useFamily, useSession } from "@/lib/hooks";
import { GrownUpGate, isGrownUpUnlocked } from "@/components/GrownUpGate";

type Ask = { id: string; text: string; status: string; triage_reason: string | null; created_at: string; kid_id: string | null; created_new: boolean; episode_id: string | null };

const STATUS: Record<string, string> = {
  needs_grownup: "Waiting for you",
  not_suitable: "Not answered",
  matched: "Already in the library",
  generating: "Being made",
  ready: "Ready",
  failed: "Couldn't confirm the facts",
  over_limit: "Over the monthly limit",
  triage: "Checking",
};

export default function GrownUps() {
  const { session } = useSession();
  const { family, kids, reload } = useFamily(Boolean(session));
  const router = useRouter();
  const [unlocked, setUnlocked] = useState(false);
  const [asks, setAsks] = useState<Ask[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setUnlocked(isGrownUpUnlocked()), []);

  const load = useCallback(async () => {
    const { data } = await supabase().from("asks").select("*").order("created_at", { ascending: false }).limit(50);
    setAsks((data ?? []) as Ask[]);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (session && unlocked) load();
  }, [session, unlocked, load]);

  if (!unlocked) return <GrownUpGate onPass={() => setUnlocked(true)} onCancel={() => router.push("/")} />;
  if (!family) return null;

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const usedThisMonth = asks.filter((a) => a.created_new && new Date(a.created_at) >= monthStart).length;
  const waiting = asks.filter((a) => a.status === "needs_grownup");
  const kidName = (id: string | null) => kids.find((k) => k.id === id)?.name ?? "";

  async function decide(a: Ask, decline: boolean) {
    setMsg(null);
    try {
      const r = await api<{ status: string; episodeId?: string }>(`/api/asks/${a.id}/approve`, {
        method: "POST",
        body: JSON.stringify(decline ? { decline: true } : { text: edits[a.id] ?? a.text }),
      });
      setMsg(decline ? "Declined." : r.status === "matched" ? "Found it in the library!" : "Making it now. It'll appear on their shelf.");
      load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  async function saySave(kidId: string, say: string) {
    await supabase().from("kids").update({ name_say_as: say || null }).eq("id", kidId);
    reload();
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <Link href="/" className="btn-soft px-4 py-2 text-base">← Home</Link>
        <h1 className="text-2xl font-bold">Grown-ups</h1>
      </header>
      {msg && <p className="card text-center">{msg}</p>}

      <section className="card space-y-3">
        <h2 className="text-xl font-semibold">Questions waiting for you</h2>
        {waiting.length === 0 && <p className="text-slate-500">Nothing waiting.</p>}
        {waiting.map((a) => (
          <div key={a.id} className="space-y-2 rounded-2xl bg-orange-50 p-3">
            <p className="text-sm text-slate-500">{kidName(a.kid_id)} asked · {a.triage_reason}</p>
            <input className="input" value={edits[a.id] ?? a.text} onChange={(e) => setEdits({ ...edits, [a.id]: e.target.value })} />
            <div className="flex justify-end gap-2">
              <button className="btn-soft py-2" onClick={() => decide(a, true)}>No thanks</button>
              <button className="btn-primary py-2" onClick={() => decide(a, false)}>Yes, make it</button>
            </div>
          </div>
        ))}
      </section>

      <section className="card space-y-2">
        <h2 className="text-xl font-semibold">This month</h2>
        <p>
          {usedThisMonth} of {family.monthly_new_limit} new episodes used. Questions already in the library are free.
        </p>
      </section>

      <section className="card space-y-3">
        <h2 className="text-xl font-semibold">Recent questions</h2>
        {asks.map((a) => (
          <div key={a.id} className="flex items-start justify-between gap-3 border-b border-orange-50 pb-2 last:border-0">
            <div>
              <p className="font-semibold">{a.text}</p>
              <p className="text-sm text-slate-500">{kidName(a.kid_id)} · {new Date(a.created_at).toLocaleDateString("en-AU")}</p>
            </div>
            <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">
              {a.episode_id && (a.status === "ready" || a.status === "matched") ? <Link href={`/e/${a.episode_id}?kid=${a.kid_id ?? ""}`}>{STATUS[a.status]} ▶</Link> : STATUS[a.status] ?? a.status}
            </span>
          </div>
        ))}
      </section>

      <section className="card space-y-3">
        <h2 className="text-xl font-semibold">Kids</h2>
        {kids.map((k) => (
          <div key={k.id} className="flex items-center gap-3">
            <span className="font-display text-lg">{k.name}</span>
            <input className="input py-2 text-base" defaultValue={k.name_say_as ?? ""} placeholder="How Otto says it" onBlur={(e) => saySave(k.id, e.target.value.trim())} />
          </div>
        ))}
        <Link href="/setup" className="btn-soft">+ Add a kid</Link>
      </section>

      {family.is_admin && (
        <section className="card space-y-3">
          <h2 className="text-xl font-semibold">Admin</h2>
          <button
            className="btn-soft"
            onClick={async () => {
              setMsg("Making the sound kit…");
              try {
                const r = await api<{ made: string[] }>("/api/admin/sound-kit", { method: "POST" });
                setMsg(`Sound kit made: ${r.made.join(", ")}`);
              } catch (e) {
                setMsg((e as Error).message);
              }
            }}
          >
            🎵 Make the sound kit
          </button>
        </section>
      )}

      <button
        className="btn-soft self-center"
        onClick={async () => {
          await supabase().auth.signOut();
          router.push("/");
        }}
      >
        Sign out
      </button>
    </main>
  );
}
