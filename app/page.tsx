"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useFamily, useSession } from "@/lib/hooks";
import { SignIn } from "@/components/SignIn";
import { Logo } from "@/components/Logo";
import { Cheko, Otto } from "@/components/Characters";
import { InTheWorks } from "@/components/InTheWorks";

export default function Home() {
  const { session, loading } = useSession();
  const { family, kids, loading: famLoading } = useFamily(Boolean(session));
  const router = useRouter();

  useEffect(() => {
    if (session && !famLoading && (!family || kids.length === 0)) router.replace("/setup");
  }, [session, famLoading, family, kids.length, router]);

  if (loading) return null;
  if (!session) return <SignIn />;
  if (famLoading || !family) return null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-8 p-6">
      <header className="flex items-center justify-center">
        <Logo size={44} />
      </header>

      <section className="flex flex-col items-center gap-3 text-center">
        <div className="flex items-end gap-3">
          <Otto size={96} />
          <div className="bob"><Cheko size={80} /></div>
        </div>
        <h1 className="text-4xl font-bold">Who&apos;s asking?</h1>
      </section>

      <section className="grid grid-cols-2 gap-4">
        {kids.map((k) => (
          <Link
            key={k.id}
            href={`/kid/${k.id}`}
            className="flex aspect-square flex-col items-center justify-center gap-2 rounded-[2rem] text-white shadow-[0_6px_0_rgba(0,0,0,.15)] transition active:scale-95"
            style={{ background: k.colour }}
          >
            <span className="text-6xl">{k.avatar === "otter" ? "🦦" : k.avatar}</span>
            <span className="font-display text-3xl font-bold">{k.name}</span>
          </Link>
        ))}
        {kids.length > 1 && (
          <Link
            href="/kid/all"
            className="col-span-2 flex items-center justify-center gap-3 rounded-[2rem] py-6 text-white shadow-[0_6px_0_rgba(0,0,0,.15)] transition active:scale-95"
            style={{ background: `linear-gradient(90deg, ${kids.map((k) => k.colour).join(", ")})` }}
          >
            <span className="text-5xl">👨‍👧‍👦</span>
            <span className="font-display text-3xl font-bold">All of us</span>
          </Link>
        )}
      </section>

      <InTheWorks />

    </main>
  );
}
