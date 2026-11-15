"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, supabase } from "@/lib/supabase/browser";
import { useFamily, useSession } from "@/lib/hooks";
import { Logo } from "@/components/Logo";

const COLOURS = ["#f97316", "#38bdf8", "#22c55e", "#a855f7", "#ec4899", "#eab308", "#14b8a6", "#ef4444"];
const AVATARS = ["otter", "🦖", "🤖", "🐉", "🦈", "🚀", "🦋", "🐨"];

type Draft = { name: string; say_as: string; age: number; colour: string; avatar: string };

export default function Setup() {
  const { session } = useSession();
  const { family, kids, reload } = useFamily(Boolean(session));
  const router = useRouter();
  const [familyName, setFamilyName] = useState("");
  const [draft, setDraft] = useState<Draft>({ name: "", say_as: "", age: 4, colour: COLOURS[0], avatar: AVATARS[0] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  async function createFamily() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/setup", { method: "POST", body: JSON.stringify({ name: familyName || "Our family" }) });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  async function hearName() {
    const name = draft.say_as || draft.name;
    if (!name) return;
    setPlaying(true);
    setError(null);
    try {
      const { data } = await supabase().auth.getSession();
      const res = await fetch("/api/say-name", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token}` },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Voice not set up yet");
      const audio = new Audio(URL.createObjectURL(await res.blob()));
      audio.onended = () => setPlaying(false);
      await audio.play();
    } catch (e) {
      setError((e as Error).message);
      setPlaying(false);
    }
  }

  async function addKid() {
    if (!family || !draft.name.trim()) return;
    setBusy(true);
    const { error } = await supabase().from("kids").insert({
      family_id: family.id,
      name: draft.name.trim(),
      name_say_as: draft.say_as.trim() || null,
      age: draft.age,
      colour: draft.colour,
      avatar: draft.avatar,
    });
    setBusy(false);
    if (error) return setError(error.message);
    setDraft({ name: "", say_as: "", age: 4, colour: COLOURS[(kids.length + 1) % COLOURS.length], avatar: AVATARS[0] });
    reload();
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-6">
      <Logo size={48} />
      {!family ? (
        <section className="card space-y-4">
          <h1 className="text-3xl font-bold">Welcome!</h1>
          <p className="text-slate-600">Let&apos;s set up your family. It takes about two minutes.</p>
          <label className="block text-sm font-semibold text-slate-600">Family name</label>
          <input className="input" value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder="The Couch family" />
          <button className="btn-primary w-full" disabled={busy} onClick={createFamily}>Next</button>
        </section>
      ) : (
        <>
          {kids.length > 0 && (
            <section className="card space-y-2">
              <h2 className="text-xl font-semibold">Your curious kids</h2>
              {kids.map((k) => (
                <div key={k.id} className="flex items-center gap-3 rounded-2xl p-2" style={{ background: `${k.colour}22` }}>
                  <span className="text-3xl">{k.avatar === "otter" ? "🦦" : k.avatar}</span>
                  <span className="font-display text-xl">{k.name}</span>
                  <span className="ml-auto text-slate-500">age {k.age}</span>
                </div>
              ))}
            </section>
          )}

          <section className="card space-y-4">
            <h2 className="text-2xl font-bold">{kids.length ? "Add another kid" : "Add your first kid"}</h2>
            <div>
              <label className="block text-sm font-semibold text-slate-600">First name</label>
              <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-600">How do you say it? (only if Otto gets it wrong)</label>
              <div className="flex gap-2">
                <input className="input" value={draft.say_as} onChange={(e) => setDraft({ ...draft, say_as: e.target.value })} placeholder="e.g. Mee-ah" />
                <button className="btn-soft shrink-0 px-4" disabled={!draft.name || playing} onClick={hearName} title="Hear Otto say it">
                  {playing ? "🔊" : "▶︎ Hear"}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-600">Age</label>
              <div className="mt-1 flex flex-wrap gap-2">
                {[2, 3, 4, 5, 6, 7, 8].map((a) => (
                  <button key={a} className={`h-12 w-12 rounded-full font-display text-xl ${draft.age === a ? "bg-sun text-white" : "bg-orange-50"}`} onClick={() => setDraft({ ...draft, age: a })}>
                    {a}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-600">Favourite colour</label>
              <div className="mt-1 flex flex-wrap gap-2">
                {COLOURS.map((c) => (
                  <button key={c} aria-label={c} className={`h-10 w-10 rounded-full ${draft.colour === c ? "ring-4 ring-ink/30" : ""}`} style={{ background: c }} onClick={() => setDraft({ ...draft, colour: c })} />
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-600">Picture</label>
              <div className="mt-1 flex flex-wrap gap-2">
                {AVATARS.map((a) => (
                  <button key={a} className={`h-12 w-12 rounded-2xl text-2xl ${draft.avatar === a ? "bg-sky/30 ring-2 ring-sky" : "bg-slate-50"}`} onClick={() => setDraft({ ...draft, avatar: a })}>
                    {a === "otter" ? "🦦" : a}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn-primary w-full" disabled={busy || !draft.name.trim()} onClick={addKid}>Add {draft.name || "kid"}</button>
          </section>

          {error && <p className="text-center text-sm text-red-600">{error}</p>}
          {kids.length > 0 && (
            <button className="btn-soft self-center" onClick={() => router.push("/")}>All done →</button>
          )}
        </>
      )}
      {error && !family && <p className="text-center text-sm text-red-600">{error}</p>}
    </main>
  );
}
