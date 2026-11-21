"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowClockwise } from "@phosphor-icons/react";
import { REFRESH_EVENT } from "@/components/RefreshBoundary";

const TRIGGER = 80; // px of pull needed to refresh
const MAX = 120;

/**
 * Pull down from the top of a page to reload it. The installed app has no browser
 * refresh, so this stands in for it. Off on the player, where pulling moves the sheet.
 */
export function PullToRefresh() {
  const pathname = usePathname();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const start = useRef<number | null>(null);
  const pullRef = useRef(0);

  useEffect(() => {
    if (pathname?.startsWith("/e/")) return;
    const onStart = (e: TouchEvent) => {
      // Not inside a sheet or dialog (swiping those down closes them), and only from the very top.
      const inSheet = e.target instanceof Element && Boolean(e.target.closest('[role="dialog"], [data-no-pull-refresh]'));
      start.current = !inSheet && window.scrollY <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null;
      setDragging(start.current !== null);
    };
    const onMove = (e: TouchEvent) => {
      if (start.current === null) return;
      const dy = e.touches[0].clientY - start.current;
      if (dy <= 0 || window.scrollY > 0) {
        pullRef.current = 0;
        setPull(0);
        return;
      }
      // Resistance, so it feels like a stretch rather than a drag.
      const p = Math.min(MAX, dy * 0.5);
      pullRef.current = p;
      setPull(p);
    };
    const onEnd = () => {
      if (start.current === null) return;
      start.current = null;
      setDragging(false);
      if (pullRef.current >= TRIGGER) {
        // Reload the page's content, not the app, so playback carries on.
        setRefreshing(true);
        setPull(TRIGGER);
        window.dispatchEvent(new Event(REFRESH_EVENT));
        setTimeout(() => {
          setRefreshing(false);
          pullRef.current = 0;
          setPull(0);
        }, 700);
      } else {
        pullRef.current = 0;
        setPull(0);
      }
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [pathname]);

  if (pull === 0 && !refreshing) return null;
  const ready = pull >= TRIGGER;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center"
      style={{ transform: `translateY(calc(env(safe-area-inset-top) + ${pull - 40}px))`, transition: dragging ? "none" : "transform 200ms" }}
      aria-hidden
    >
      <span className={`grid h-10 w-10 place-items-center rounded-full bg-white shadow-md ring-1 ring-slate-200 ${ready ? "text-ember" : "text-slate-400"}`}>
        <ArrowClockwise
          size={20}
          weight="bold"
          className={refreshing ? "animate-spin" : ""}
          style={refreshing ? undefined : { transform: `rotate(${(pull / TRIGGER) * 270}deg)` }}
        />
      </span>
    </div>
  );
}
