"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/supabase/browser";

type Info = { code: string | null; isOwner: boolean; members: { user_id: string; email: string | null }[] };

/** Invite another grown-up (e.g. the other parent) into this family. */
export function ShareFamily() {
  const [info, setInfo] = useState<Info | null>(null);
  const [copied, setCopied] = useState(false);
  const load = () => api<Info>("/api/family/invite").then(setInfo).catch(() => null);
  useEffect(() => {
    load();
  }, []);
  if (!info) return null;
  const link = info.code ? `${window.location.origin}/join/${info.code}` : null;

  async function make() {
    const r = await api<{ code: string }>("/api/family/invite", { method: "POST" });
    setInfo((i) => (i ? { ...i, code: r.code } : i));
  }
  async function share() {
    if (!link) return;
    const text = "Join our family on WOE! — Otto and Cheko answer the kids' questions.";
    if (navigator.share) await navigator.share({ title: "WOE! What On Earth?", text, url: link }).catch(() => null);
    else {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    }
  }
  async function remove(userId?: string) {
    await api(`/api/family/invite${userId ? `?user=${userId}` : ""}`, { method: "DELETE" });
    load();
  }

  return (
    <section className="card space-y-3">
      <h2 className="text-xl font-semibold">Grown-ups in this family</h2>
      {info.members.length > 0 && (
        <ul className="space-y-1">
          {info.members.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between gap-2">
              <span>{m.email ?? "Grown-up"}</span>
              {info.isOwner && <button className="text-sm text-slate-500 underline" onClick={() => remove(m.user_id)}>Remove</button>}
            </li>
          ))}
        </ul>
      )}
      {info.isOwner ? (
        <>
          <p className="text-slate-600">Send this link to another grown-up. They sign in with their own email and see the same kids, shelves and library.</p>
          {link ? (
            <div className="space-y-2">
              <p className="break-all rounded-xl bg-orange-50 p-2 text-sm">{link}</p>
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary py-2" onClick={share}>{copied ? "Copied!" : "Share link"}</button>
                <button className="btn-soft py-2" onClick={make}>New link</button>
                <button className="btn-soft py-2" onClick={() => remove()}>Turn link off</button>
              </div>
            </div>
          ) : (
            <button className="btn-primary py-2" onClick={make}>Make an invite link</button>
          )}
        </>
      ) : (
        <p className="text-slate-600">You joined this family. The grown-up who set it up can invite others.</p>
      )}
    </section>
  );
}
