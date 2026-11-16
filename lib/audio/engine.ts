"use client";

/**
 * Gapless episode player on Web Audio.
 * - Trims the silence ElevenLabs leaves at the start and end of each clip.
 * - Plays spot effects overlapping the start of a line, kit stings before it.
 * - Loops a quiet ambience bed under everything, ducked under the theme tune.
 * - Pausing suspends the whole clock, so waits and thinking-pauses pause too.
 */

export type EngineItem = { url: string; pause_after_s: number; kind: string; fx_url?: string };
export type EngineState = "idle" | "playing" | "thinking" | "paused" | "done";

const GAP_S = 0.18; // breath between lines
const AMBIENCE_GAIN = 0.14;

export class Engine {
  private ctx: AudioContext | null = null;
  private cache = new Map<string, Promise<AudioBuffer | null>>();
  private active = new Set<AudioScheduledSourceNode>();
  private token = 0;
  private bed: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  index = 0;

  constructor(
    private items: EngineItem[],
    private sfx: Record<string, string>,
    private ambienceUrl: string | null,
    private onChange: (state: EngineState, index: number) => void,
  ) {}

  private audio() {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
    }
    return this.ctx;
  }

  private load(url: string | undefined, trim = true): Promise<AudioBuffer | null> {
    if (!url) return Promise.resolve(null);
    const key = `${trim ? "t" : "r"}:${url}`;
    if (!this.cache.has(key)) {
      const ctx = this.audio();
      this.cache.set(
        key,
        fetch(url)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
          .then((b) => ctx.decodeAudioData(b))
          .then((buf) => (trim ? trimSilence(ctx, buf) : buf))
          .catch(() => null),
      );
    }
    return this.cache.get(key)!;
  }

  private prefetch(from: number) {
    for (let i = from; i < Math.min(this.items.length, from + 3); i++) {
      const it = this.items[i];
      this.load(it.url);
      if (it.fx_url) this.load(it.fx_url);
    }
  }

  /** Plays a buffer and resolves when it ends (or is stopped). */
  private play(buf: AudioBuffer, gain = 1, offsetEnd = 0): Promise<void> {
    const ctx = this.audio();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(ctx.destination);
    this.active.add(src);
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.active.delete(src);
        resolve();
      };
      src.onended = finish;
      src.start();
      // Resolve early (e.g. to overlap the next clip) while the sound plays on.
      if (offsetEnd > 0) this.wait(Math.max(0, buf.duration - offsetEnd)).then(finish);
    });
  }

  /** Waits on the audio clock, so it pauses when the episode pauses. */
  private wait(seconds: number): Promise<void> {
    const ctx = this.audio();
    const buf = ctx.createBuffer(1, Math.max(1, Math.round(seconds * ctx.sampleRate)), ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    this.active.add(src);
    return new Promise((resolve) => {
      src.onended = () => {
        this.active.delete(src);
        resolve();
      };
      src.start();
    });
  }

  private async startBed() {
    if (this.bed || !this.ambienceUrl) return;
    const buf = await this.load(this.ambienceUrl, false);
    if (!buf || this.bed) return;
    const ctx = this.audio();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain).connect(ctx.destination);
    src.start();
    this.bed = { src, gain };
  }

  private bedTo(level: number, seconds = 1.2) {
    if (!this.bed || !this.ctx) return;
    const g = this.bed.gain.gain;
    g.cancelScheduledValues(this.ctx.currentTime);
    g.setValueAtTime(g.value, this.ctx.currentTime);
    g.linearRampToValueAtTime(level, this.ctx.currentTime + seconds);
  }

  private stopAll() {
    this.token++;
    for (const s of this.active) {
      try {
        s.stop();
      } catch {}
    }
    this.active.clear();
  }

  async start(from = 0) {
    const ctx = this.audio();
    this.stopAll();
    if (ctx.state === "suspended") await ctx.resume();
    const token = this.token;
    this.startBed();
    for (let i = from; i < this.items.length; i++) {
      if (token !== this.token) return;
      this.index = i;
      this.onChange("playing", i);
      this.prefetch(i + 1);
      const it = this.items[i];

      if (it.kind === "theme") {
        this.bedTo(0, 0.2);
        const buf = await this.load(it.url, true);
        // Let Otto come in over the last moment of the tune.
        if (buf) await this.play(buf, 0.85, Math.min(0.8, buf.duration / 4));
        if (token !== this.token) return;
        this.bedTo(AMBIENCE_GAIN, 2.5);
        continue;
      }
      if (it.kind === "sting") this.bedTo(0, 1.5);

      const sting = it.kind.startsWith("sfx:") ? it.kind.slice(4) : null;
      if (sting && this.sfx[sting]) {
        const buf = await this.load(this.sfx[sting]);
        if (buf && token === this.token) await this.play(buf, 0.8);
        if (token !== this.token) return;
      }
      if (it.fx_url) {
        const fx = await this.load(it.fx_url);
        // Effect leads, the voice joins as it tails off.
        if (fx && token === this.token) await this.play(fx, 0.7, Math.min(fx.duration * 0.45, 1.2));
        if (token !== this.token) return;
      }
      const voice = await this.load(it.url);
      if (token !== this.token) return;
      if (voice) await this.play(voice, 1);
      if (token !== this.token) return;

      if (it.pause_after_s > 0) {
        this.onChange("thinking", i);
        await this.wait(it.pause_after_s);
      } else {
        await this.wait(GAP_S);
      }
    }
    if (token !== this.token) return;
    this.bedTo(0, 1.5);
    this.onChange("done", this.items.length - 1);
  }

  async pause() {
    if (this.ctx?.state === "running") await this.ctx.suspend();
    this.onChange("paused", this.index);
  }

  async resume() {
    if (this.ctx?.state === "suspended") await this.ctx.resume();
    this.onChange("playing", this.index);
  }

  /** Skips a thinking pause. */
  skipPause() {
    this.start(this.index + 1);
  }

  jump(to: number) {
    this.start(Math.max(0, Math.min(this.items.length - 1, to)));
  }

  destroy() {
    this.stopAll();
    try {
      this.bed?.src.stop();
    } catch {}
    this.ctx?.close().catch(() => {});
  }
}

/** Removes near-silent lead-in and tail, keeping a short natural edge. */
function trimSilence(ctx: BaseAudioContext, buf: AudioBuffer, threshold = 0.012, keep = 0.04): AudioBuffer {
  const data = buf.getChannelData(0);
  let start = 0;
  let end = data.length - 1;
  while (start < end && Math.abs(data[start]) < threshold) start++;
  while (end > start && Math.abs(data[end]) < threshold) end--;
  const pad = Math.round(keep * buf.sampleRate);
  start = Math.max(0, start - pad);
  end = Math.min(data.length - 1, end + pad);
  const length = end - start + 1;
  if (length <= 0 || length >= data.length - pad) return buf;
  const out = ctx.createBuffer(buf.numberOfChannels, length, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) out.copyToChannel(buf.getChannelData(c).subarray(start, end + 1), c);
  return out;
}
