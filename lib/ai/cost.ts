import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Rough AI cost tracking, in US dollars, per episode run.
 * Prices are list prices (Nov 2026); update here if they change.
 */
const PER_M: Record<string, { in: number; out: number; cacheRead?: number; cacheWrite?: number }> = {
  "claude-sonnet-5-5": { in: 2, out: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  // Introductory Gemini Flash price until 31 Dec 2026 ($1.50 / $7.50 after).
  "gemini-3.8-flash": { in: 0.75, out: 3.75 },
  "gemini-3.6-flash": { in: 0.75, out: 3.75 },
};
const CLAUDE_WEB_SEARCH = 0.01; // per search
const GEMINI_IMAGE = 0.067; // per 1K image

export type CostLine = { step: string; model: string; usd: number; tokens_in?: number; tokens_out?: number };
type Tally = { lines: CostLine[]; elevenChars: number; step: string };

const store = new AsyncLocalStorage<Tally>();

export function trackCosts<T>(fn: () => Promise<T>): Promise<{ result?: T; error?: unknown; tally: Tally }> {
  const tally: Tally = { lines: [], elevenChars: 0, step: "other" };
  return store.run(tally, async () => {
    try {
      return { result: await fn(), tally };
    } catch (error) {
      return { error, tally };
    }
  });
}

export function costStep(step: string) {
  const t = store.getStore();
  if (t) t.step = step;
}

export function addTokens(model: string, u: { in: number; out: number; cacheRead?: number; cacheWrite?: number; searches?: number }) {
  const t = store.getStore();
  if (!t) return;
  const p = PER_M[model] ?? PER_M["claude-sonnet-5-5"];
  const usd =
    (u.in * p.in + u.out * p.out + (u.cacheRead ?? 0) * (p.cacheRead ?? p.in) + (u.cacheWrite ?? 0) * (p.cacheWrite ?? p.in)) / 1e6 +
    (u.searches ?? 0) * CLAUDE_WEB_SEARCH;
  t.lines.push({ step: t.step, model, usd, tokens_in: u.in + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0), tokens_out: u.out });
}

export function addImage(model: string) {
  const t = store.getStore();
  t?.lines.push({ step: t.step, model, usd: GEMINI_IMAGE });
}

export function addElevenChars(n: number) {
  const t = store.getStore();
  if (t) t.elevenChars += n;
}
