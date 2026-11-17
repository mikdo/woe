"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, supabase } from "@/lib/supabase/browser";
import { useSession } from "@/lib/hooks";
import { isGrownUpUnlocked } from "@/components/GrownUpGate";
import { SkyPage } from "@/components/SkyPage";
import { ArrowLeft, SpeakerHigh } from "@phosphor-icons/react";

type Word = { id: string; family_id: string | null; word: string; alias: string; approved: boolean };

export default function Words() {
  const { session } = useSession();
  const router = useRouter();
  const [words, setWords] = useState<Word[]>([]);
  const [canShared, setCanShared] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [nw, setNw] = useState({ word: "", alias: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await api<{ words: Word[]; canEditShared: boolean }>("/api/pronunciations");
    setWords(r.words);
    setCanShared(r.canEditShared);
  }, []);
  useEffect(() => {
    if (!isGrownUpUnlocked()) router.replace("/grownups");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    else if (session) load().catch((e) => setMsg(e.message));
  }, [session, load, router]);

  async function hear(word: string, alias: string, key: string) {
    setBusy(key);
    try {
      const { data } = await supabase().auth.getSession();
      const res = await fetch("/api/pronunciations/hear", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token}` },
        body: JSON.stringify({ word, alias }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't play that");
      const url = URL.createObjectURL(await res.blob());
      const a = new Audio(url);
      a.onended = () => URL.revokeObjectURL(url);
      await a.play();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't play that");
    } finally {
      setBusy(null);
    }
  }
  async function save(w: Word) {
    await api("/api/pronunciations", { method: "PATCH", body: JSON.stringify({ id: w.id, alias: edits[w.id] ?? w.alias, approved: true }) });
    setEdits((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== w.id)));
    load();
  }
  async function remove(w: Word) {
    await api(`/api/pronunciations?id=${w.id}`, { method: "DELETE" });
    load();
  }
  async function add() {
    await api("/api/pronunciations", { method: "POST", body: JSON.stringify({ ...nw, shared: canShared }) });
    setNw({ word: "", alias: "" });
    load();
  }

  const shown = words.filter((w) => !q || w.word.toLowerCase().includes(q.toLowerCase()));
  const editable = (w: Word) => w.family_id !== null || canShared;

  return (
    <SkyPage
      hero={
        <div className="pb-3">
          <Link href="/grownups" className="press grid h-11 w-11 place-items-center rounded-full bg-white shadow-[0_3px_0_#e2e8f0]" aria-label="Back to Grown-ups">
            <ArrowLeft size={20} weight="bold" />
          </Link>
          <h1 className="pop-in mt-4 text-[1.75rem] font-black leading-tight">How Otto says it</h1>
          <p className="mt-1 text-sm font-semibold text-ink/60">Tricky words, and how the voices should say them</p>
        </div>
      }
    >
      {msg && <p className="pop-in rounded-2xl bg-ink px-4 py-3 text-center text-sm font-semibold text-white">{msg}</p>}

      <section className="card space-y-2">
        <p className="text-slate-600">
          Words the voices find tricky, and how to say them. Write the &ldquo;say it like&rdquo; in plain lower case with hyphens, like{" "}
          <b>pat-a-go-tie-tan</b>. No capitals (the voice spells them out). Tap the speaker to hear Otto try it. Changes apply to new recordings.
        </p>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <input className="input" placeholder="Word" value={nw.word} onChange={(e) => setNw({ ...nw, word: e.target.value })} />
          <input className="input" placeholder="Say it like" value={nw.alias} onChange={(e) => setNw({ ...nw, alias: e.target.value })} />
          <button className="btn-soft px-3" disabled={!nw.word || busy === "new"} onClick={() => hear(nw.word, nw.alias, "new")} aria-label="Hear it"><SpeakerHigh size={20} weight="fill" /></button>
        </div>
        <button className="btn-primary w-full py-2" disabled={!nw.word || !nw.alias} onClick={add}>Add word</button>
      </section>

      <input className="input" placeholder="Search words" value={q} onChange={(e) => setQ(e.target.value)} />

      <ul className="space-y-2">
        {shown.map((w) => {
          const val = edits[w.id] ?? w.alias;
          const changed = edits[w.id] !== undefined && edits[w.id] !== w.alias;
          return (
            <li key={w.id} className="card space-y-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-lg font-semibold">{w.word}</span>
                <span className="text-xs text-slate-500">
                  {w.family_id ? "Just us" : "Everyone"}
                  {!w.approved && " · new, check me"}
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  value={val}
                  disabled={!editable(w)}
                  onChange={(e) => setEdits({ ...edits, [w.id]: e.target.value })}
                />
                <button className="btn-soft px-3" disabled={busy === w.id} onClick={() => hear(w.word, val, w.id)} aria-label="Hear it">
                  {busy === w.id ? "…" : <SpeakerHigh size={20} weight="fill" />}
                </button>
              </div>
              {editable(w) && (
                <div className="flex justify-end gap-2">
                  <button className="text-sm text-slate-500 underline" onClick={() => remove(w)}>Remove</button>
                  {(changed || !w.approved) && (
                    <button className="btn-primary py-1.5 text-sm" onClick={() => save(w)}>{changed ? "Save" : "Sounds right"}</button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </SkyPage>
  );
}
