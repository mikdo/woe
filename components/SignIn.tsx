"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase/browser";
import { Logo } from "@/components/Logo";
import { Cheko, Otto } from "@/components/Characters";
import { Art, SkyPage } from "@/components/SkyPage";
import { Envelope } from "@phosphor-icons/react";

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

  const heading = {
    signin: "Welcome back",
    signup: "Make a family account",
    forgot: "Forgot your password?",
    link: "Sign in with a link",
  }[mode];

  return (
    <SkyPage
      hero={
        <Art
          name="sign-in"
          alt="Otto and Cheko"
          className="mx-auto max-h-[38dvh] object-contain"
          fallback={
            <div className="flex flex-col items-center gap-4 pb-2 pt-6 text-center">
              <div className="flex items-end gap-2">
                <span className="drift text-4xl opacity-80" style={{ animationDelay: "-1s" }}>☁️</span>
                <Otto size={84} />
                <div className="bob"><Cheko size={64} /></div>
                <span className="drift text-3xl opacity-80" style={{ animationDelay: "-2.5s" }}>☁️</span>
              </div>
              <Logo size={64} />
            </div>
          }
        />
      }
    >
      <div className="pop-in text-center">
        <h1 className="text-2xl font-bold leading-tight">{sent ? "Check your email" : heading}</h1>
        <p className="mt-1.5 text-slate-600">{note ?? "What On Earth? Ask Otto and Cheko anything."}</p>
      </div>
      {sent ? (
        <div className="card space-y-4 text-center">
          <Envelope size={40} weight="duotone" className="mx-auto text-ember" />
          <p className="text-lg">{sent}</p>
          <button className="text-sm font-bold text-ember" onClick={() => { setSent(null); setMode("signin"); }}>
            Back to sign in
          </button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {needsPassword && (
            <div className="grid grid-cols-2 gap-1 rounded-full bg-white p-1 ring-1 ring-slate-200" role="tablist">
              {(["signin", "signup"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => { setMode(m); setError(null); }}
                  className={`press rounded-full py-2.5 text-sm font-bold transition-colors ${mode === m ? "bg-ink text-white" : "text-slate-500"}`}
                >
                  {m === "signin" ? "Sign in" : "New here"}
                </button>
              ))}
            </div>
          )}
          <div className="card space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-600">Grown-up&apos;s email</span>
              <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </label>
            {needsPassword && (
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-600">Password</span>
                <input
                  className="input"
                  type="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "At least 8 characters" : ""}
                />
              </label>
            )}
            {mode === "forgot" && <p className="text-sm text-slate-500">We&apos;ll email you a link to choose a new password.</p>}
            {mode === "link" && <p className="text-sm text-slate-500">We&apos;ll email you a link that signs you straight in. No password needed.</p>}
            {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
            <button className="btn-primary w-full" type="submit" disabled={busy || !email.includes("@") || (needsPassword && !password)}>
              {busy ? "…" : label}
            </button>
          </div>
          <div className="flex flex-col items-center gap-2 text-sm font-bold text-ember">
            {mode === "signin" ? (
              <button type="button" onClick={() => setMode("forgot")}>Forgot or never set a password?</button>
            ) : (
              <button type="button" onClick={() => setMode("signin")}>Use a password</button>
            )}
            {mode !== "link" && (
              <button type="button" onClick={() => setMode("link")}>Email me a link instead</button>
            )}
          </div>
        </form>
      )}
    </SkyPage>
  );
}
