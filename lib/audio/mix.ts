import "server-only";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

export const RATE = 44100;

function run(args: string[], input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error("ffmpeg missing"));
    const p = spawn(ffmpegPath, ["-hide_banner", "-loglevel", "error", ...args]);
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    p.stdout.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => err.push(d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg ${code}: ${Buffer.concat(err).toString().slice(0, 300)}`))));
    p.stdin.on("error", () => {});
    p.stdin.end(input);
  });
}

/** Any audio file -> mono float samples at RATE. */
export async function decode(file: Buffer): Promise<Float32Array> {
  const raw = await run(["-i", "pipe:0", "-f", "f32le", "-ac", "1", "-ar", String(RATE), "pipe:1"], file);
  const copy = new Uint8Array(raw.byteLength);
  copy.set(raw);
  return new Float32Array(copy.buffer, 0, Math.floor(raw.byteLength / 4));
}

/** Mono float samples -> MP3, with a gentle limiter so nothing clips. */
export async function encode(samples: Float32Array): Promise<Buffer> {
  const input = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  return run(
    ["-f", "f32le", "-ar", String(RATE), "-ac", "1", "-i", "pipe:0", "-af", "alimiter=limit=0.9:attack=5:release=60", "-c:a", "libmp3lame", "-b:a", "112k", "-f", "mp3", "pipe:1"],
    input,
  );
}

/**
 * Trims near-silence from the start and end of a voice clip, but keeps soft edges
 * (breaths, trailing consonants) and fades the cut points so nothing clicks.
 */
export function trim(x: Float32Array, threshold = 0.004, lead = 0.08, tail = 0.22): Float32Array {
  const win = Math.round(RATE * 0.01);
  const loud = (i: number) => {
    let peak = 0;
    for (let j = i; j < Math.min(x.length, i + win); j++) peak = Math.max(peak, Math.abs(x[j]));
    return peak > threshold;
  };
  let s = 0;
  while (s < x.length && !loud(s)) s += win;
  let e = x.length - win;
  while (e > s && !loud(e)) e -= win;
  s = Math.max(0, s - Math.round(lead * RATE));
  e = Math.min(x.length, e + win + Math.round(tail * RATE));
  if (e <= s) return x;
  const out = x.slice(s, e);
  const f = Math.min(Math.round(RATE * 0.012), Math.floor(out.length / 2));
  for (let i = 0; i < f; i++) {
    out[i] *= i / f;
    out[out.length - 1 - i] *= i / f;
  }
  return out;
}

export const sec = (n: number) => n / RATE;

/** A growing mix bus. Clips are added at a time with a gain. */
export class Bus {
  data = new Float32Array(RATE * 60);
  length = 0;

  private ensure(n: number) {
    if (n <= this.data.length) return;
    let size = this.data.length;
    while (size < n) size *= 2;
    const next = new Float32Array(size);
    next.set(this.data);
    this.data = next;
  }

  /** Adds a clip at `at` seconds; returns its end time in seconds. */
  add(clip: Float32Array, at: number, gain = 1): number {
    const start = Math.max(0, Math.round(at * RATE));
    this.ensure(start + clip.length);
    for (let i = 0; i < clip.length; i++) this.data[start + i] += clip[i] * gain;
    this.length = Math.max(this.length, start + clip.length);
    return sec(start + clip.length);
  }

  extend(to: number) {
    const n = Math.round(to * RATE);
    this.ensure(n);
    this.length = Math.max(this.length, n);
  }

  /** Loops a bed under [from, to] with fades in and out. */
  bed(loop: Float32Array, from: number, to: number, gain: number, fade = 2) {
    if (!loop.length) return;
    const s = Math.round(from * RATE);
    const e = Math.min(this.length, Math.round(to * RATE));
    const f = Math.round(fade * RATE);
    for (let i = s; i < e; i++) {
      const env = Math.min(1, (i - s) / f, (e - i) / f);
      this.data[i] += loop[(i - s) % loop.length] * gain * env;
    }
  }

  out(): Float32Array {
    return this.data.slice(0, this.length + Math.round(RATE * 0.3));
  }
}
