"use client";
import { Fragment, useEffect, useState, type ReactNode } from "react";

export const REFRESH_EVENT = "woe:refresh";

/**
 * Pull to refresh re-mounts the page (so it fetches everything again) instead of reloading the app,
 * so whatever is playing keeps playing.
 */
export function RefreshBoundary({ children }: { children: ReactNode }) {
  const [key, setKey] = useState(0);
  useEffect(() => {
    const bump = () => setKey((k) => k + 1);
    window.addEventListener(REFRESH_EVENT, bump);
    return () => window.removeEventListener(REFRESH_EVENT, bump);
  }, []);
  return <Fragment key={key}>{children}</Fragment>;
}
