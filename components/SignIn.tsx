"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { Logo } from "@/components/Logo";
import { Cheko, Otto } from "@/components/Characters";

type Mode = "signin" | "signup" | "forgot" | "link";

export function SignIn({ redirectTo, note }: { redirectTo?: string; note?: string } = {}) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const back = () => redirectTo ?? window.location.origin;

  async function submit() {
    setBusy(true);
    setError(null);
    const sb = supabase().auth;
    const addr = email.trim();
    try {
      if (mode === "signin") {
        const { error } = await sb.signInWithPassword({ email: addr, password });
        if (error) throw new Error(error.message === "Invalid login credentials" ? "That email and password don't match. Forgot it, or never set one? Use the link below." : error.message);
      } else if (mode === "signup") {
        if (password.length < 8) throw new Error("Use at least 8 characters.");
        const { data, error } = await sb.signUp({ email: addr, password, options: { emailRedirectTo: back() } });
        if (error) throw error;
        if (!data.session) setSent("Check your email to confirm your account, then come back and sign in.");
      } else if (mode === "forgot") {
        const { error } = await sb.resetPasswordForEmail(addr, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        setSent("Check your email for a link to set a new password.");
      } else {
        const { error } = await sb.signInWithOtp({ email: addr, options: { emailRedirectTo: back() } });
        if (error) throw error;
        setSent("Check your email for a sign-in link. 📬");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const needsPassword = mode === "signin" || mode === "signup";
  const label = { signin: "Sign in", signup: "Create account", forgot: "Email me a reset link", link: "Email me a sign-in link" }[mode];

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="flex items-end gap-2">
        <Otto size={80} />
        <div className="bob"><Cheko size={64} /></div>
      </div>
      <Logo size={72} />
      <p className="text-lg text-slate-600">{note ?? "What On Earth? Ask Otto and Cheko anything."}</p>
      {sent ? (
        <div className="card w-full space-y-3">
          <p className="text-lg">{sent}</p>
          <button className="text-sm font-semibold text-slate-500 underline" onClick={() => { setSent(null); setMode("signin"); }}>
            Back to sign in
          </button>
        </div>
      ) : (
        <form
          className="card w-full space-y-3 text-left"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {needsPassword && (
            <div className="grid grid-cols-2 gap-1 rounded-full bg-orange-50 p-1">
              {(["signin", "signup"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setError(null); }}
                  className={`rounded-full py-2 font-display font-semibold ${mode === m ? "bg-white shadow" : "text-slate-500"}`}
                >
                  {m === "signin" ? "Sign in" : "New here"}
                </button>
              ))}
            </div>
          )}
          <label className="block text-sm font-semibold text-slate-600">Grown-up&apos;s email</label>
          <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          {needsPassword && (
            <>
              <label className="block text-sm font-semibold text-slate-600">Password</label>
              <input
                className="input"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "At least 8 characters" : ""}
              />
            </>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="btn-primary w-full" type="submit" disabled={busy || !email.includes("@") || (needsPassword && !password)}>
            {busy ? "…" : label}
          </button>
          <div className="flex flex-wrap justify-between gap-2 pt-1 text-sm font-semibold text-slate-500">
            {mode === "signin" ? (
              <button type="button" className="underline" onClick={() => setMode("forgot")}>Forgot or never set a password?</button>
            ) : (
              <button type="button" className="underline" onClick={() => setMode("signin")}>Use a password</button>
            )}
            {mode !== "link" && (
              <button type="button" className="underline" onClick={() => setMode("link")}>Email me a link instead</button>
            )}
          </div>
        </form>
      )}
    </main>
  );
}
