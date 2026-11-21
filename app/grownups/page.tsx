"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ArrowSquareOut,
  CaretRight,
  ChartBar,
  ClockCounterClockwise,
  HandWaving,
  Key,
  MicrophoneSlash,
  PaintBrush,
  SignOut,
  SpeakerHigh,
  UsersThree,
  Wrench,
  type Icon,
} from "@phosphor-icons/react";
import { api, supabase } from "@/lib/supabase/browser";
import { useFamily, useSession } from "@/lib/hooks";
import { NO_CREDITS } from "@/lib/stages";
import { ART_SLOTS, artSrc } from "@/lib/art";
import { GrownUpGate, isGrownUpUnlocked } from "@/components/GrownUpGate";
import { ShareFamily } from "@/components/ShareFamily";
import { CostCard } from "@/components/CostCard";
import { SetPassword } from "@/components/SetPassword";
import { Art, SkyPage } from "@/components/SkyPage";
import { Cheko, Otto } from "@/components/Characters";

type Ask = {
  id: string;
  text: string;
  status: string;
  triage_reason: string | null;
  created_at: string;
  kid_id: string | null;
  created_new: boolean;
  episode_id: string | null;
  episodes: { stage: string | null } | null;
};
type Parked = { id: string; title: string | null; question: string };

/** Label and chip colour for each ask status. */
const STATUS: Record<string, { label: string; tone: string }> = {
  needs_grownup: { label: "Waiting for you", tone: "bg-ember/15 text-[#b5541f]" },
  not_suitable: { label: "Not answered", tone: "bg-slate-100 text-slate-600" },
  matched: { label: "In the library", tone: "bg-leaf/15 text-green-800" },
  generating: { label: "Being made", tone: "bg-sky/20 text-sky-900" },
  ready: { label: "Ready", tone: "bg-leaf/15 text-green-800" },
  failed: { label: "Facts didn't check out", tone: "bg-slate-100 text-slate-600" },
  over_limit: { label: "Over the monthly limit", tone: "bg-slate-100 text-slate-600" },
  triage: { label: "Checking", tone: "bg-sky/20 text-sky-900" },
};
const NO_VOICE = { label: "Needs voice credits", tone: "bg-ember/15 text-[#b5541f]" };

/** A labelled group of settings, like the sections in a music app's settings screen. */
function Group({ icon: I, label, children }: { icon: Icon; label: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 px-1 font-sans text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">
        <I size={16} weight="bold" className="text-ember" />
        {label}
      </h2>
      {children}
    </section>
  );
}

function kidEmoji(avatar: string) {
  return avatar === "otter" ? "🦦" : avatar;
}

export default function GrownUps() {
  const { session } = useSession();
  const { family, kids, reload } = useFamily(Boolean(session));
  const router = useRouter();
  const [unlocked, setUnlocked] = useState(false);
  const [asks, setAsks] = useState<Ask[]>([]);
  const [parked, setParked] = useState<Parked[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setUnlocked(isGrownUpUnlocked()), []);

  const load = useCallback(async () => {
    const { data } = await supabase().from("asks").select("*, episodes!asks_episode_id_fkey(stage)").order("created_at", { ascending: false }).limit(50);
    setAsks((data ?? []) as Ask[]);
  }, []);
  const loadParked = useCallback(async (familyId: string) => {
    const { data } = await supabase()
      .from("episodes")
      .select("id, title, question")
      .eq("created_by_family", familyId)
      .eq("status", "generating")
      .eq("stage", NO_CREDITS);
    setParked((data ?? []) as Parked[]);
  }, []);
  useEffect(() => {
    if (!session || !unlocked) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    if (family) loadParked(family.id);
  }, [session, unlocked, load, loadParked, family]);

  if (!unlocked) return <GrownUpGate onPass={() => setUnlocked(true)} onCancel={() => router.push("/")} />;
  if (!family) return <main className="min-h-dvh bg-sky-wash" />;

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const usedThisMonth = asks.filter((a) => a.created_new && new Date(a.created_at) >= monthStart).length;
  const usedPct = Math.min(100, (usedThisMonth / Math.max(1, family.monthly_new_limit)) * 100);
  const waiting = asks.filter((a) => a.status === "needs_grownup");
  const recent = showAll ? asks : asks.slice(0, 6);
  const kidName = (id: string | null) => kids.find((k) => k.id === id)?.name ?? "";
  const kidNames = kids.map((k) => k.name).join(" and ");

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

  async function finishParked() {
    setResuming(true);
    setMsg(null);
    await Promise.all(parked.map((p) => api(`/api/episodes/${p.id}/resume`, { method: "POST" }).catch(() => null)));
    setMsg("Recording again. If the credits are still empty it'll stop here again, with nothing lost.");
    setParked([]);
    setResuming(false);
    setTimeout(() => family && loadParked(family.id), 20000);
  }

  async function saySave(kidId: string, say: string) {
    await supabase().from("kids").update({ name_say_as: say || null }).eq("id", kidId);
    reload();
  }

  const hero = (
    <div className="flex items-end justify-between gap-4 pb-3 pt-2">
      <div className="pop-in min-w-0">
        <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-ink/55">{family.name}</p>
        <h1 className="mt-1 whitespace-nowrap text-[1.85rem] font-black leading-[1.05]">Grown-ups</h1>
        {kidNames && <p className="mt-1.5 text-sm font-semibold text-ink/60">Questions, sharing and settings for {kidNames}</p>}
      </div>
      <Art
        name="grownups"
        className="h-28 w-28 shrink-0 object-contain"
        fallback={
          <div className="flex shrink-0 items-end">
            <Otto size={56} />
            <div className="-ml-2 bob"><Cheko size={44} /></div>
          </div>
        }
      />
    </div>
  );

  return (
    <SkyPage hero={hero}>
      {msg && (
        <p className="pop-in rounded-2xl bg-ink px-4 py-3 text-center text-sm font-semibold text-white" role="status">
          {msg}
        </p>
      )}

      {parked.length > 0 && (
        <section className="pop-in space-y-3 rounded-3xl bg-white p-4 shadow-[0_4px_0_#f1e4cc] ring-2 ring-ember">
          <div className="flex items-center gap-3">
            <Art
              name="lost-voice"
              className="h-14 w-14 shrink-0 object-contain"
              fallback={
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ember/15 text-ember">
                  <MicrophoneSlash size={24} weight="fill" />
                </span>
              }
            />
            <h3 className="text-lg font-bold leading-tight">Voice credits ran out</h3>
          </div>
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              {parked.length === 1 ? "This episode is written, checked and saved, and just needs its voices." : `These ${parked.length} episodes are written, checked and saved, and just need their voices.`} Top up your
              ElevenLabs plan, then tap Finish recording.
            </p>
            <ul className="space-y-1">
              {parked.map((p) => (
                <li key={p.id} className="rounded-xl bg-orange-50 px-3 py-2 text-sm font-semibold">
                  {p.title ?? p.question}
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-2 gap-2">
              <a className="btn-soft whitespace-nowrap px-3 py-2.5 text-sm" href="https://elevenlabs.io/app/subscription" target="_blank" rel="noreferrer">
                Top up <ArrowSquareOut size={16} weight="bold" />
              </a>
              <button className="btn-primary whitespace-nowrap px-3 py-2.5 text-sm" disabled={resuming} onClick={finishParked}>
                {resuming ? "Starting…" : "Finish recording"}
              </button>
            </div>
          </div>
        </section>
      )}

      <Group icon={HandWaving} label="Waiting for you">
        {waiting.length === 0 ? (
          <p className="card py-4 text-slate-500">Nothing waiting. Big questions land here first so you can say yes.</p>
        ) : (
          waiting.map((a) => (
            <div key={a.id} className="card space-y-3">
              <p className="text-sm text-slate-500">
                <b className="text-ink">{kidName(a.kid_id) || "Someone"} asked</b> · {a.triage_reason}
              </p>
              <input className="input" value={edits[a.id] ?? a.text} onChange={(e) => setEdits({ ...edits, [a.id]: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-soft whitespace-nowrap px-3 py-2.5 text-sm" onClick={() => decide(a, true)}>No thanks</button>
                <button className="btn-primary whitespace-nowrap px-3 py-2.5 text-sm" onClick={() => decide(a, false)}>Yes, make it</button>
              </div>
            </div>
          ))
        )}
      </Group>

      <Group icon={ChartBar} label="This month">
        <div className="card space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-display text-3xl font-bold">
              {usedThisMonth}
              <span className="text-lg text-slate-400"> / {family.monthly_new_limit}</span>
            </p>
            <p className="text-sm font-semibold text-slate-500">new episodes</p>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-orange-100">
            <div className="bar-grow h-full rounded-full bg-ember" style={{ width: `${usedPct}%` }} />
          </div>
          <p className="text-sm text-slate-500">Questions already in the library are free.</p>
        </div>
        <CostCard familyId={family.id} />
      </Group>

      <Group icon={UsersThree} label="Family">
        <div className="card space-y-3">
          <h3 className="text-lg font-semibold">Kids</h3>
          {kids.map((k) => (
            <div key={k.id} className="flex items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-2xl" style={{ background: `${k.colour}33` }}>
                {kidEmoji(k.avatar)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display font-semibold leading-tight">
                  {k.name} <span className="font-sans text-sm font-semibold text-slate-400">· {k.age}</span>
                </p>
                <input
                  className="mt-1 w-full rounded-xl border-2 border-orange-100 bg-white px-3 py-1.5 text-sm outline-none focus:border-sky"
                  defaultValue={k.name_say_as ?? ""}
                  placeholder="How Otto says it (optional)"
                  onBlur={(e) => saySave(k.id, e.target.value.trim())}
                />
              </div>
            </div>
          ))}
          <Link href="/setup" className="btn-soft w-full py-2 text-base">+ Add a kid</Link>
        </div>
        <ShareFamily />
      </Group>

      <Group icon={SpeakerHigh} label="Voices">
        <Link href="/grownups/words" className="press card flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sky-wash text-sky-900">
            <SpeakerHigh size={22} weight="fill" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-semibold">How Otto says it</span>
            <span className="text-sm text-slate-500">Check and fix tricky words</span>
          </span>
          <CaretRight size={20} weight="bold" className="text-slate-400" />
        </Link>
      </Group>

      <Group icon={ClockCounterClockwise} label="Recent questions">
        <div className="card divide-y divide-orange-50 py-2">
          {asks.length === 0 && <p className="py-2 text-slate-500">No questions yet.</p>}
          {recent.map((a) => {
            const s = a.status === "generating" && a.episodes?.stage === NO_CREDITS ? NO_VOICE : STATUS[a.status] ?? { label: a.status, tone: "bg-slate-100 text-slate-600" };
            const playable = a.episode_id && (a.status === "ready" || a.status === "matched");
            const row = (
              <>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-snug">{a.text}</p>
                  <p className="text-xs font-semibold text-slate-400">
                    {[kidName(a.kid_id), new Date(a.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${s.tone}`}>
                  {s.label}
                  {playable && " ▶"}
                </span>
              </>
            );
            return playable ? (
              <Link key={a.id} href={`/e/${a.episode_id}?kid=${a.kid_id ?? ""}`} className="flex items-start gap-3 py-2.5">
                {row}
              </Link>
            ) : (
              <div key={a.id} className="flex items-start gap-3 py-2.5">
                {row}
              </div>
            );
          })}
          {asks.length > 6 && (
            <button className="w-full pt-2.5 text-sm font-bold text-ember" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show fewer" : `Show all ${asks.length}`}
            </button>
          )}
        </div>
      </Group>

      <Group icon={Key} label="Account">
        <SetPassword title="Your password" />
        <button
          className="btn-soft w-full"
          onClick={async () => {
            await supabase().auth.signOut();
            router.push("/");
          }}
        >
          <SignOut size={18} weight="bold" /> Sign out
        </button>
      </Group>

      {family.is_admin && (
        <Group icon={Wrench} label="Admin">
          <div className="card space-y-3">
            <h3 className="text-lg font-semibold">Voice test</h3>
            <p className="text-sm text-slate-500">Hear Otto and Cheko before the first episode.</p>
            <div className="flex flex-wrap gap-2">
              {["Hello and hook", "Explainer and new word", "Game and goodbye"].map((label, i) => (
                <button
                  key={label}
                  className="btn-soft py-2 text-sm"
                  onClick={async () => {
                    setMsg(`Making "${label}"…`);
                    try {
                      const { data } = await supabase().auth.getSession();
                      const res = await fetch("/api/admin/voice-test", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token}` },
                        body: JSON.stringify({ sample: i }),
                      });
                      if (!res.ok) throw new Error((await res.json()).error ?? "Voice failed");
                      const audio = new Audio(URL.createObjectURL(await res.blob()));
                      setMsg(`Playing "${label}"`);
                      await audio.play();
                    } catch (e) {
                      setMsg((e as Error).message);
                    }
                  }}
                >
                  ▶︎ {label}
                </button>
              ))}
            </div>
            <button
              className="btn-soft w-full py-2 text-sm"
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
          </div>
          <Rerecord onMsg={setMsg} />
          <DrawingSlots />
        </Group>
      )}
    </SkyPage>
  );
}

/** Re-voices lines edited after an episode was recorded (e.g. the old "stay curious" sign-offs). Hidden when nothing is waiting. */
function Rerecord({ onMsg }: { onMsg: (m: string) => void }) {
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ left: number }>("/api/admin/rerecord")
      .then((r) => setLeft(r.left))
      .catch(() => setLeft(0));
  }, []);
  if (!left) return null;
  return (
    <div className="card space-y-3">
      <h3 className="text-lg font-semibold">Edited lines to re-record</h3>
      <p className="text-sm text-slate-500">
        {left} {left === 1 ? "part" : "parts"} of older episodes had their words fixed (new sign-off, Cheko staying in his new form). Only
        those parts get re-voiced; the rest of each episode stays as it is.
      </p>
      <button
        className="btn-primary w-full py-2 text-sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          onMsg("Re-recording… this takes a couple of minutes.");
          try {
            const r = await api<{ done: number; left: number }>("/api/admin/rerecord", { method: "POST" });
            setLeft(r.left);
            onMsg(r.left ? `Re-recorded ${r.done}. ${r.left} left, tap again to finish.` : `All done: re-recorded ${r.done}.`);
          } catch (e) {
            onMsg((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Re-recording…" : `Re-record ${left} ${left === 1 ? "part" : "parts"}`}
      </button>
    </div>
  );
}

/** Which drawing slots in /public/art are filled, so Mikey knows what's left to draw. */
function DrawingSlots() {
  const [have, setHave] = useState<Record<string, boolean>>({});
  useEffect(() => {
    for (const s of ART_SLOTS) {
      fetch(artSrc(s.name), { method: "HEAD" })
        .then((r) => setHave((h) => ({ ...h, [s.name]: r.ok })))
        .catch(() => setHave((h) => ({ ...h, [s.name]: false })));
    }
  }, []);
  const done = ART_SLOTS.filter((s) => have[s.name]).length;
  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <PaintBrush size={20} weight="fill" className="text-ember" /> Drawing slots
        </h3>
        <span className="text-sm font-bold text-slate-500">
          {done} of {ART_SLOTS.length} drawn
        </span>
      </div>
      <p className="text-sm text-slate-500">
        Save a drawing as <b>public/art/&lt;name&gt;.webp</b> and deploy. It replaces the placeholder straight away.
      </p>
      <ul className="space-y-2">
        {ART_SLOTS.map((s) => (
          <li key={s.name} className="flex items-center gap-3 rounded-2xl bg-orange-50 p-2">
            {have[s.name] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={artSrc(s.name)} alt="" className="h-11 w-11 shrink-0 rounded-xl bg-white object-contain" />
            ) : (
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border-2 border-dashed border-orange-200 text-orange-300">
                <PaintBrush size={18} />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block font-mono text-sm font-bold">{s.name}.webp</span>
              <span className="block text-xs text-slate-500">
                {s.where} · {s.size}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
