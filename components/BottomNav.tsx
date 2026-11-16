"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/hooks";

const TABS = [
  { href: "/", label: "Ask", icon: "🙋", match: (p: string) => p === "/" || p.startsWith("/kid/") },
  { href: "/library", label: "Library", icon: "📚", match: (p: string) => p.startsWith("/library") || p.startsWith("/e/") },
  { href: "/grownups", label: "Grown-ups", icon: "🧑‍🍳", match: (p: string) => p.startsWith("/grownups") },
];

/** Thumb-reach tabs for phones. */
export function BottomNav() {
  const path = usePathname();
  const { session } = useSession();
  const show = Boolean(session) && !path.startsWith("/setup") && !path.startsWith("/join");
  useEffect(() => {
    document.documentElement.classList.toggle("has-bottom-nav", show);
    return () => document.documentElement.classList.remove("has-bottom-nav");
  }, [show]);
  if (!show) return null;
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-orange-100 bg-white/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Main"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-3">
        {TABS.map((t) => {
          const active = t.match(path);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                className={`flex flex-col items-center gap-0.5 py-2 font-display text-sm font-semibold transition active:scale-95 ${active ? "text-sun" : "text-slate-500"}`}
                aria-current={active ? "page" : undefined}
              >
                <span className={`text-2xl ${active ? "" : "opacity-70"}`}>{t.icon}</span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
