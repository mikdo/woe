"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase/browser";

/** Set or change the signed-in grown-up's password. */
export function SetPassword({ title = "Password", onDone }: { title?: string; onDone?: () => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (pw.length < 8) return setMsg("Use at least 8 characters.");
    if (pw !== pw2) return setMsg("Those don't match.");
    setBusy(true);
    const { error } = await supabase().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setMsg(error.message);
    setPw("");
    setPw2("");
    setMsg("Saved. You can sign in with your email and this password.");
    onDone?.();
  }

  return (
    <section className="card space-y-3">
      <h3 className="text-lg font-semibold">{title}</h3>
      <input className="input" type="password" autoComplete="new-password" placeholder="New password (8+ characters)" value={pw} onChange={(e) => setPw(e.target.value)} />
      <input className="input" type="password" autoComplete="new-password" placeholder="Type it again" value={pw2} onChange={(e) => setPw2(e.target.value)} />
      {msg && <p className="text-sm text-slate-600">{msg}</p>}
      <button className="btn-primary w-full py-2" disabled={busy || !pw} onClick={save}>
        {busy ? "Saving…" : "Save password"}
      </button>
    </section>
  );
}
