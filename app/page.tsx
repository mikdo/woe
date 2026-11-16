"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, ClockCounterClockwise, Sparkle } from "@phosphor-icons/react";
import { useFamily, useSession } from "@/lib/hooks";
import { supabase } from "@/lib/supabase/browser";
import { SignIn } from "@/components/SignIn";
import { Cheko, Otto } from "@/components/Characters";
import { InTheWorks } from "@/components/InTheWorks";
import { Art, SkyPage } from "@/components/SkyPage";
import { artUrl, type EpisodeLite } from "@/components/EpisodeCard";

type CarryOn = { episode: EpisodeLite; listener: string; pct: number };

/** Big "WHAT ON EARTH?" title with the globe as the O, until the hero drawing exists. */
function HeroFallback() {
  return (
    <div className="flex flex-col items-center gap-4 pb-4 pt-2 text-center">
      <h1 className="text-[2.6rem] font-black uppercase leading-[0.95] tracking-tight">
        What <span className="inline-block drift">🌏</span>n
        <br />
        Earth?
      </h1>
      <div className="flex items-end gap-2">
        <span className="text-4xl opacity-80 drift" style={{ animationDelay: "-1s" }}>☁️</span>
        <Otto size={92} />
        <div className="bob"><Cheko size={70} /></div>
        <span className="text-3xl opacity-80 drift" style={{ animationDelay: "-2.5s" }}>☁️</span>
      </div>
    </div>
  );
}

export default function Home() {
  const { session, loading } = useSession();
  const { family, kids, loading: famLoading } = useFamily(Boolean(session));
  const router = useRouter();
  const [carry, setCarry] = useState<CarryOn[]>([]);

  useEffect(() => {
    if (session && !famLoading && (!family || kids.length === 0)) router.replace("/setup");
  }, [session, famLoading, family, kids.length, router]);

  // Episodes you stopped part-way through, newest first.
  useEffect(() => {
    if (!session) return;
    supabase()
      .from("listens")
      .select("listener, position, duration, updated_at, episodes(id, title, question, category, art_path, cheko_form, status, band)")
      .eq("heard", false)
      .gt("position", 10)
      .order("updated_at", { ascending: false })
      .limit(3)
      .then(({ data }) =>
        setCarry(
          ((data ?? []) as unknown as { listener: string; position: number; duration: number; episodes: EpisodeLite }[])
            .filter((r) => r.episodes?.status === "ready")
            .map((r) => ({ episode: r.episodes, listener: r.listener, pct: r.duration ? Math.min(1, r.position / r.duration) : 0 })),
        ),
      );
  }, [session]);

  if (loading) return null;
  if (!session) return <SignIn />;
  if (famLoading || !family) return <main className="min-h-dvh bg-sky-wash" />;

  // Mostly everyone listens together, so a new adventure starts as "All of us".
  const newHref = kids.length > 1 ? "/kid/all" : `/kid/${kids[0]?.id ?? "all"}`;

  return (
    <SkyPage canPeek hero={<Art name="home" alt="Otto and Cheko" className="mx-auto max-h-[46dvh] object-contain" fallback={<HeroFallback />} />}>
      <h2 className="pop-in text-center text-2xl font-bold">What are we doing today?</h2>

      <div className="stagger flex flex-col gap-4">
        <Link href={newHref} className="press card relative flex min-h-36 overflow-hidden">
          <div className="relative z-10 flex flex-1 flex-col justify-between gap-3 pr-24">
            <span className="text-2xl font-bold leading-tight">Start a new adventure</span>
            <span className="flex items-center gap-1.5 text-sm font-bold text-slate-500">
              <Sparkle weight="fill" className="text-ember" /> Ask Otto and Cheko
            </span>
          </div>
          <Art
            name="new-adventure"
            className="absolute -bottom-2 -right-2 h-36 w-36 object-contain"
            fallback={<span className="absolute -bottom-3 right-1 text-[6.5rem] leading-none">🦖</span>}
          />
        </Link>

        <section className="card flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xl font-bold leading-tight">Revisit an adventure</span>
            <Link href="/library" className="press flex items-center gap-1 text-sm font-bold text-ember">
              All <ArrowRight weight="bold" />
            </Link>
          </div>
          {carry.length === 0 ? (
            <Link href="/library" className="press flex items-center gap-2 text-sm font-semibold text-slate-500">
              <ClockCounterClockwise /> Journey back with Otto and Cheko in the library
            </Link>
          ) : (
            <ul className="flex flex-col gap-2">
              {carry.map((c) => {
                const art = artUrl(c.episode.art_path);
                return (
                  <li key={c.episode.id + c.listener}>
                    <Link
                      href={`/e/${c.episode.id}${c.listener !== "library" ? `?kid=${c.listener}` : ""}`}
                      className="press flex items-center gap-3 rounded-2xl bg-orange-50 p-2"
                    >
                      {art ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={art} alt="" className="h-12 w-12 rounded-xl object-cover" />
                      ) : (
                        <span className="grid h-12 w-12 place-items-center rounded-xl bg-sky-wash text-2xl">🌏</span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{c.episode.title ?? c.episode.question}</span>
                        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-orange-100">
                          <span className="bar-grow block h-full rounded-full bg-ember" style={{ width: `${Math.round(c.pct * 100)}%` }} />
                        </span>
                      </span>
                      <span className="text-xs font-bold text-slate-500">Carry on</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <InTheWorks />
    </SkyPage>
  );
}
