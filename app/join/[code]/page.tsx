"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/supabase/browser";
import { useSession } from "@/lib/hooks";
import { SignIn } from "@/components/SignIn";
import { Cheko, Otto } from "@/components/Characters";

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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 p-6 text-center">
      <div className="flex items-end gap-2">
        <Otto size={80} />
        <div className="bob"><Cheko size={64} /></div>
      </div>
      {joined && <p className="text-2xl font-bold">Welcome to {joined}! 🎉</p>}
      {error && (
        <>
          <p className="text-lg">{error}</p>
          <Link className="btn-soft" href="/">Home</Link>
        </>
      )}
      {!joined && !error && <p className="text-lg">Joining…</p>}
    </main>
  );
}
