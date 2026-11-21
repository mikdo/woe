"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/hooks";
import { Books, MagnifyingGlass, Sparkle, UsersThree, type Icon } from "@phosphor-icons/react";

const TABS: { href: string; label: string; icon: Icon; match: (p: string) => boolean }[] = [
  { href: "/", label: "Adventure", icon: Sparkle, match: (p) => p === "/" || p.startsWith("/kid/") },
  { href: "/search", label: "Search", icon: MagnifyingGlass, match: (p) => p.startsWith("/search") },
  { href: "/library", label: "Library", icon: Books, match: (p) => p.startsWith("/library") || p.startsWith("/e/") },
  { href: "/grownups", label: "Grown-ups", icon: UsersThree, match: (p) => p.startsWith("/grownups") },
];

/** Thumb-reach tabs for phones. */
export function BottomNav() {
  const path = usePathname();
  const { session } = useSession();
  const show = Boolean(session) && !path.startsWith("/setup") && !path.startsWith("/join") && !path.startsWith("/reset-password");
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
      <ul className="mx-auto grid max-w-xl grid-cols-4">
        {TABS.map((t) => {
          const active = t.match(path);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                className={`press flex flex-col items-center gap-1 py-2.5 text-[11px] font-bold tracking-wide ${active ? "text-ember" : "text-slate-500"}`}
                aria-current={active ? "page" : undefined}
              >
                <t.icon size={26} weight={active ? "fill" : "regular"} className={active ? "celebrate" : ""} />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
