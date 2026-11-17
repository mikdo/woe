"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/supabase/browser";
import { useSession } from "@/lib/hooks";
import { SignIn } from "@/components/SignIn";
import { Cheko, Otto } from "@/components/Characters";
import { SkyPage } from "@/components/SkyPage";

export default function Join() {
  const { code } = useParams<{ code: string }>();
  const { session, loading } = useSession();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    api<{ joined: string }>("/api/family/join", { method: "POST", body: JSON.stringify({ code }) })
      .then((r) => {
        setJoined(r.joined);
        setTimeout(() => router.replace("/"), 1500);
      })
      .catch((e) => setError(e.message));
  }, [session, code, router]);

  if (loading) return null;
  if (!session)
    return <SignIn redirectTo={typeof window !== "undefined" ? window.location.href : undefined} note="You've been invited to a WOE! family. Pop in your email to join." />;

  return (
    <SkyPage
      hero={
        <div className="flex justify-center pb-2 pt-8">
          <div className="flex items-end gap-2">
            <Otto size={84} />
            <div className="bob"><Cheko size={64} /></div>
          </div>
        </div>
      }
    >
      <div className="pop-in flex flex-col items-center gap-4 py-4 text-center">
        {joined && (
          <>
            <h1 className="celebrate text-2xl font-bold">Welcome to {joined}! 🎉</h1>
            <p className="text-slate-600">Taking you to the kids…</p>
          </>
        )}
        {error && (
          <>
            <h1 className="text-2xl font-bold">That invite didn&apos;t work</h1>
            <p className="text-slate-600">{error}</p>
            <Link className="btn-soft" href="/">Home</Link>
          </>
        )}
        {!joined && !error && <h1 className="text-2xl font-bold">Joining…</h1>}
      </div>
    </SkyPage>
  );
}
