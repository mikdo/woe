"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, supabase } from "@/lib/supabase/browser";
import { STAGES } from "@/lib/stages";
import { InTheWorks } from "@/components/InTheWorks";
import { useFamily, useSession } from "@/lib/hooks";
import { Cheko, Otto } from "@/components/Characters";
import { GrownUpGate, isGrownUpUnlocked } from "@/components/GrownUpGate";
import { EpisodeCard, type EpisodeLite } from "@/components/EpisodeCard";
import { PillSelect } from "@/components/SkyPage";
import { BANDS } from "@/lib/types";
import { ArrowLeft, Keyboard, Microphone, Stop } from "@phosphor-icons/react";
import { bandForAge, type Band } from "@/lib/types";

type Phase =
  | { kind: "idle" }
  | { kind: "recording" }
  | { kind: "hearing" }
  | { kind: "confirm"; text: string; source: "voice" | "typed"; options?: string[]; heard?: string }
  | { kind: "sending"; text: string }
  | { kind: "thinking"; askId: string; episodeId: string | null; stage: string }
  | { kind: "message"; emoji: string; title: string; body: string; approveAskId?: string };



export default function KidPage() {
  const { kidId } = useParams<{ kidId: string }>();
  const router = useRouter();
  const { session } = useSession();
  const { kids } = useFamily(Boolean(session));
  const isAll = kidId === "all";
  const kid = isAll
    ? kids.length
      ? {
          id: "all",
          name: "All of us",
          colour: kids[0].colour,
          avatar: "👨‍👧‍👦",
          age: Math.min(...kids.map((k) => k.age)),
        }
      : undefined
    : kids.find((k) => k.id === kidId);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [approveGate, setApproveGate] = useState<string | null>(null);
  const [gate, setGate] = useState(false);
  const [typed, setTyped] = useState<string | null>(null);
  const [shelf, setShelf] = useState<EpisodeLite[]>([]);
  const [bandChoice, setBandChoice] = useState<Band | null>(null);
  // "Ask more about this": a follow-up to an episode (from the player).
  const [follow, setFollow] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    if (!session) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("follow");
    const q = params.get("q");
    if (!id) return;
    supabase()
      .from("episodes")
      .select("id, title, question")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setFollow({ id: data.id, title: data.title ?? data.question });
        if (q) setPhase({ kind: "confirm", text: q, source: "typed" });
      });
    window.history.replaceState(null, "", window.location.pathname);
  }, [session]);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadShelf = useCallback(async () => {
    let q = supabase()
      .from("family_library")
      .select("favourite, episodes(id, title, question, category, art_path, cheko_form, status, band)")
      .order("added_at", { ascending: false })
      .limit(24);
    if (kidId !== "all") q = q.eq("kid_id", kidId);
    const { data } = await q;
    setShelf(((data ?? []) as unknown as { favourite: boolean; episodes: EpisodeLite }[]).map((r) => ({ ...r.episodes, favourite: r.favourite })).filter((e) => e?.status === "ready"));
  }, [kidId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (session) loadShelf();
  }, [session, loadShelf]);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: rec.mimeType });
        setPhase({ kind: "hearing" });
        try {
          const form = new FormData();
          form.append("audio", blob, "question");
          const { text, options } = await api<{ text: string; options: string[] }>("/api/transcribe", { method: "POST", body: form });
          if (!text || !options?.length) throw new Error("empty");
          setPhase({ kind: "confirm", text: options[0], source: "voice", options, heard: text });
        } catch {
          setPhase({ kind: "message", emoji: "👂", title: "Otto didn't quite hear that", body: "Let's try again, nice and loud!" });
        }
      };
      recorder.current = rec;
      rec.start();
      setPhase({ kind: "recording" });
      stopTimer.current = setTimeout(stopRecording, 15000);
    } catch {
      setPhase({ kind: "message", emoji: "🎤", title: "We need the microphone", body: "Ask a grown-up to allow the microphone, or type the question." });
    }
  }

  function stopRecording() {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  async function send(text: string, source: "voice" | "typed") {
    setPhase({ kind: "sending", text });
    try {
      const r = await api<{ askId: string; status: string; episodeId?: string; reason?: string }>("/api/ask", {
        method: "POST",
        body: JSON.stringify({ kidId, text, source, band, parentEpisodeId: follow?.id }),
      });
      setFollow(null);
      handleStatus(r.askId, r.status, r.episodeId ?? null, r.reason);
    } catch (e) {
      setPhase({ kind: "message", emoji: "🛠️", title: "Something went wrong", body: (e as Error).message });
    }
  }

  async function approve(askId: string, yes: boolean) {
    if (!yes) {
      await api(`/api/asks/${askId}/approve`, { method: "POST", body: JSON.stringify({ decline: true }) }).catch(() => null);
      return setPhase({ kind: "idle" });
    }
    setPhase({ kind: "thinking", askId, episodeId: null, stage: "queued" });
    try {
      const r = await api<{ status: string; episodeId?: string | null; reason?: string | null }>(`/api/asks/${askId}/approve`, { method: "POST", body: "{}" });
      handleStatus(askId, r.status, r.episodeId ?? null, r.reason);
    } catch (e) {
      setPhase({ kind: "message", emoji: "😕", title: "Something went wrong", body: e instanceof Error ? e.message : "Try again" });
    }
  }

  function handleStatus(askId: string, status: string, episodeId: string | null, reason?: string | null) {
    if ((status === "matched" || status === "ready") && episodeId) return router.push(`/e/${episodeId}?kid=${kidId}`);
    if (status === "generating" || status === "triage") return setPhase({ kind: "thinking", askId, episodeId, stage: "queued" });
    if (status === "needs_grownup")
      return setPhase({
        kind: "message",
        emoji: "🤗",
        title: "That's a big question!",
        body: reason ? `Grown-up check: ${reason}` : "Let's ask a grown-up about this one first.",
        approveAskId: askId,
      });
    if (status === "not_suitable")
      return setPhase({ kind: "message", emoji: "🙊", title: "Otto can't answer that one", body: "That's a question for a grown-up. Want to ask something else?" });
    if (status === "over_limit")
      return setPhase({ kind: "message", emoji: "📅", title: "Lots of new questions this month!", body: reason ?? "Try one from the library, or ask again next month." });
    return setPhase({ kind: "message", emoji: "👂", title: "Otto wasn't sure what you asked", body: "Can you ask it a different way?" });
  }

  // Poll while thinking.
  const thinking = phase.kind === "thinking" ? phase : null;
  useEffect(() => {
    if (!thinking) return;
    let stop = false;
    let resumed = false;
    const tick = async () => {
      const { data: ask } = await supabase().from("asks").select("status, episode_id, triage_reason").eq("id", thinking.askId).single();
      if (stop || !ask) return;
      if (ask.status !== "generating" && ask.status !== "triage") {
        if (ask.status === "failed")
          return setPhase({ kind: "message", emoji: "🔎", title: "Otto couldn't double-check this one", body: "Some facts didn't check out, so we didn't make it. A grown-up can try asking it differently." });
        return handleStatus(thinking.askId, ask.status, ask.episode_id, ask.triage_reason);
      }
      if (ask.episode_id) {
        const { data: ep } = await supabase().from("episodes").select("stage, status, updated_at").eq("id", ask.episode_id).single();
        if (ep) {
          if (ep.status === "ready") return router.push(`/e/${ask.episode_id}?kid=${kidId}`);
          setPhase((p) => (p.kind === "thinking" ? { ...p, episodeId: ask.episode_id, stage: ep.stage ?? "queued" } : p));
          const stale = Date.now() - new Date(ep.updated_at).getTime() > 4 * 60 * 1000;
          if (!resumed && (ep.stage === "error" || stale)) {
            resumed = true;
            api(`/api/episodes/${ask.episode_id}/resume`, { method: "POST" }).catch(() => {});
          }
        }
      }
    };
    tick();
    const t = setInterval(tick, 3000);
    return () => {
      stop = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thinking?.askId]);

  if (!kid) return null;
  const band: Band = bandChoice ?? bandForAge(kid.age);

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col bg-cream">
      <div className="relative bg-sky-wash px-6 pb-12" style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}>
        <div className="flex items-center justify-between">
          <Link href="/" className="press grid h-11 w-11 place-items-center rounded-full bg-white shadow-[0_3px_0_#e2e8f0]" aria-label="Home">
            <ArrowLeft size={20} weight="bold" />
          </Link>
          <div className="flex items-end gap-1.5">
            <Otto size={48} />
            <div className="bob"><Cheko size={40} /></div>
          </div>
        </div>
        <h1 className="pop-in mt-4 text-center text-3xl font-black leading-tight">
          {isAll ? "Ok, everyone's coming!" : `Ok, ${kid.name}'s ready!`}
        </h1>
        {kids.length > 1 && (
          <div className="mt-4 flex flex-wrap justify-center gap-2" aria-label="Who's listening">
            {[{ id: "all", name: "All of us" }, ...kids].map((k) => (
              <Link
                key={k.id}
                href={`/kid/${k.id}`}
                aria-current={k.id === kidId ? "page" : undefined}
                className={`press rounded-full px-4 py-1.5 text-sm font-bold ${k.id === kidId ? "bg-ink text-white" : "bg-white/70 text-ink"}`}
              >
                {k.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      <section className="relative -mt-8 flex flex-1 flex-col items-center gap-6 rounded-t-[2rem] border-t-[6px] border-ember bg-cream px-6 py-6 text-center">
        {follow && (phase.kind === "idle" || phase.kind === "confirm") && (
          <div className="flex items-center gap-2 rounded-full bg-sky/15 px-4 py-2 text-sm font-semibold">
            <span>🔗 Asking more about: {follow.title}</span>
            <button aria-label="Not a follow-up" className="text-slate-500" onClick={() => setFollow(null)}>✕</button>
          </div>
        )}
        {phase.kind === "idle" && (
          <>
            <div className="flex w-full items-center justify-between gap-3">
              <h2 className="text-left text-2xl font-bold">What&apos;s the question?</h2>
              <PillSelect
                label="Listening level"
                value={band}
                options={BANDS.map((b) => ({ value: b.id, label: `${b.label} ${b.ages}` }))}
                onChange={(b) => setBandChoice(b)}
              />
            </div>
            <button
              onClick={startRecording}
              className="press grid h-44 w-44 place-items-center rounded-full bg-ember text-white shadow-[0_8px_0_#b5541f] active:shadow-[0_3px_0_#b5541f]"
              aria-label="Ask a question"
            >
              <Microphone size={84} weight="fill" />
            </button>
            <p className="text-slate-500">Tap and ask Otto anything</p>
            <button className="btn-soft py-2 text-sm" onClick={() => (isGrownUpUnlocked() ? setTyped("") : setGate(true))}>
              <Keyboard size={18} weight="bold" /> Grown-up types it
            </button>
          </>
        )}

        {phase.kind === "recording" && (
          <>
            <h2 className="pop-in text-2xl font-bold">I&apos;m listening…</h2>
            <button onClick={stopRecording} className="recording press grid h-44 w-44 place-items-center rounded-full bg-ember text-white" aria-label="Done">
              <Stop size={72} weight="fill" />
            </button>
            <p className="text-slate-500">Tap when you&apos;re done</p>
          </>
        )}

        {(phase.kind === "hearing" || phase.kind === "sending") && (
          <>
            <h1 className="text-3xl font-bold">{phase.kind === "hearing" ? "Hmm, let me hear…" : "Whoaaa…"}</h1>
            {phase.kind === "sending" && <p className="text-2xl">&ldquo;{phase.text}&rdquo;</p>}
            <Dots />
          </>
        )}

        {phase.kind === "confirm" && (
          <>
            {(phase.options?.length ?? 0) > 1 ? (
              <>
                <p className="text-slate-500">Do you want to know…</p>
                <div className="flex w-full flex-col gap-3">
                  {phase.options!.map((o) => (
                    <button
                      key={o}
                      className="card w-full text-left font-display text-2xl font-semibold transition active:scale-[0.98]"
                      onClick={() => send(o, phase.source)}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="text-slate-500">Do you want to know…</p>
                <p className="font-display text-3xl font-semibold">&ldquo;{phase.text}&rdquo;</p>
              </>
            )}
            {phase.heard && phase.heard !== phase.text && (
              <p className="max-w-xs text-sm text-slate-400">Otto heard: &ldquo;{phase.heard}&rdquo;</p>
            )}
            <div className="flex flex-wrap justify-center gap-3">
              <button className="btn-soft" onClick={() => setPhase({ kind: "idle" })}>↺ Ask again</button>
              <button className="btn-soft" onClick={() => { setTyped(phase.text); setPhase({ kind: "idle" }); }}>✏️ Change it</button>
              {(phase.options?.length ?? 0) <= 1 && (
                <button className="btn-primary px-8 text-xl" onClick={() => send(phase.text, phase.source)}>Yes! ✓</button>
              )}
            </div>
          </>
        )}

        {phase.kind === "thinking" && (
          <>
            <h1 className="text-3xl font-bold">{STAGES[phase.stage] ?? "Making your episode…"}</h1>
            <Dots />
            <p className="max-w-xs text-slate-500">This takes a couple of minutes. Otto checks every fact before he tells you!</p>
          </>
        )}

        {phase.kind === "message" && (
          <>
            <div className="text-7xl">{phase.emoji}</div>
            <h1 className="text-3xl font-bold">{phase.title}</h1>
            <p className="max-w-xs text-lg text-slate-600">{phase.body}</p>
            {phase.approveAskId ? (
              <div className="flex flex-wrap justify-center gap-2">
                <button className="btn-primary" onClick={() => (isGrownUpUnlocked() ? approve(phase.approveAskId!, true) : setApproveGate(phase.approveAskId!))}>
                  Grown-up: make it
                </button>
                <button className="btn-soft" onClick={() => approve(phase.approveAskId!, false)}>Not this one</button>
              </div>
            ) : (
              <button className="btn-primary" onClick={() => setPhase({ kind: "idle" })}>Ask another</button>
            )}
          </>
        )}
      </section>

      {typed !== null && (
        <div className="card space-y-3">
          <label className="block text-sm font-semibold text-slate-600">{isAll ? "The question" : `${kid.name}'s question`}, in their words</label>
          <input className="input" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Why do cats purr?" />
          <div className="flex justify-end gap-2">
            <button className="btn-soft" onClick={() => setTyped(null)}>Cancel</button>
            <button
              className="btn-primary"
              disabled={!typed.trim()}
              onClick={() => {
                const t = typed.trim();
                setTyped(null);
                send(t, "typed");
              }}
            >
              Ask Otto
            </button>
          </div>
        </div>
      )}

      {phase.kind === "idle" && <InTheWorks kidId={kidId} onReady={loadShelf} />}

      {shelf.length > 0 && phase.kind === "idle" && (
        <section className="space-y-3">
          <h2 className="text-2xl font-bold">{isAll ? "Our shelf" : `${kid.name}'s shelf`}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {shelf.map((e) => (
              <EpisodeCard key={e.id} episode={e} href={`/e/${e.id}?kid=${kid.id}`} />
            ))}
          </div>
        </section>
      )}

      {approveGate && (
        <GrownUpGate
          onCancel={() => setApproveGate(null)}
          onPass={() => {
            const id = approveGate;
            setApproveGate(null);
            approve(id, true);
          }}
        />
      )}
      {gate && <GrownUpGate onCancel={() => setGate(false)} onPass={() => { setGate(false); setTyped(""); }} />}
    </main>
  );
}

function Dots() {
  return (
    <div className="flex gap-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="dot h-4 w-4 rounded-full bg-sky" style={{ animationDelay: `${i * 0.16}s` }} />
      ))}
    </div>
  );
}
