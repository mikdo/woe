"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { Logo } from "@/components/Logo";
import { Cheko, Otto } from "@/components/Characters";

export function SignIn() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    setError(null);
    const { error } = await supabase().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="flex items-end gap-2">
        <Otto size={80} />
        <div className="bob"><Cheko size={64} /></div>
      </div>
      <Logo size={72} />
      <p className="text-lg text-slate-600">What On Earth? Ask Otto and Cheko anything.</p>
      {sent ? (
        <div className="card w-full">
          <p className="text-lg">Check your email for a sign-in link. 📬</p>
        </div>
      ) : (
        <div className="card w-full space-y-3 text-left">
          <label className="block text-sm font-semibold text-slate-600">Grown-up&apos;s email</label>
          <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="btn-primary w-full" disabled={busy || !email.includes("@")} onClick={send}>
            Send me a sign-in link
          </button>
        </div>
      )}
    </main>
  );
}
