import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "@/lib/config";

let client: Anthropic | null = null;
function anthropic() {
  if (!client) client = new Anthropic({ apiKey: config.anthropicKey });
  return client;
}

export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.search(/[[{]/);
  const end = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
  if (start === -1 || end === -1) throw new Error("Model did not return JSON");
  return JSON.parse(body.slice(start, end + 1)) as T;
}

/** Ask Claude for JSON. Optionally lets it search the web (server tool). Retries once if the reply isn't JSON. */
export async function claudeJson<T>(opts: {
  model?: string;
  system: string;
  user: string;
  webSearch?: boolean;
  maxTokens?: number;
}): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text, stop } = await claudeText({ ...opts, maxTokens: (opts.maxTokens ?? 8000) * (attempt + 1) });
    try {
      return extractJson<T>(text);
    } catch (e) {
      lastErr = e;
      console.error("claudeJson parse failed", { stop, length: text.length, head: text.slice(0, 300), tail: text.slice(-200) });
    }
  }
  throw lastErr;
}

async function claudeText(opts: {
  model?: string;
  system: string;
  user: string;
  webSearch?: boolean;
  maxTokens?: number;
}): Promise<{ text: string; stop: string | null }> {
  const tools = opts.webSearch
    ? ([{ type: config.claudeWebSearchTool, name: "web_search", max_uses: 6 }] as unknown as Anthropic.Messages.ToolUnion[])
    : undefined;
  const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: opts.user }];
  let text = "";
  let stop: string | null = null;
  // Server tools can pause a long turn; continue it a few times if so.
  for (let i = 0; i < 4; i++) {
    const stream = anthropic().messages.stream({
      model: opts.model ?? config.claudeWriter,
      max_tokens: Math.min(opts.maxTokens ?? 8000, 32000),
      system: `${opts.system}\n\nReply with the JSON only: no preamble, no explanation, no markdown fences.`,
      messages,
      ...(tools ? { tools } : {}),
    });
    const res = await stream.finalMessage();
    stop = res.stop_reason;
    text += res.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    if (res.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: res.content });
  }
  return { text, stop };
}
