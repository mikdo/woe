import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { jsonrepair } from "jsonrepair";
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
  const raw = body.slice(start, end + 1);
  try {
    return JSON.parse(raw) as T;
  } catch {
    return JSON.parse(jsonrepair(raw)) as T;
  }
}

/**
 * Ask Claude for JSON.
 * Without web search the answer comes back through a forced "submit" tool call, so it is always valid JSON.
 * With web search (a server tool) it comes back as text, parsed with a repair fallback. Retries once.
 */
export async function claudeJson<T>(opts: {
  model?: string;
  system: string;
  user: string;
  webSearch?: boolean;
  maxTokens?: number;
}): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const maxTokens = Math.min((opts.maxTokens ?? 8000) * (attempt + 1), 32000);
    try {
      if (!opts.webSearch) return await claudeTool<T>({ ...opts, maxTokens });
      const { text, stop } = await claudeText({ ...opts, maxTokens });
      try {
        return extractJson<T>(text);
      } catch (e) {
        console.error("claudeJson parse failed", { stop, length: text.length, head: text.slice(0, 300), tail: text.slice(-200) });
        throw e;
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function claudeTool<T>(opts: { model?: string; system: string; user: string; maxTokens: number }): Promise<T> {
  const stream = anthropic().messages.stream({
    model: opts.model ?? config.claudeWriter,
    max_tokens: opts.maxTokens,
    system: `${opts.system}\n\nCall the submit tool with the JSON object described above as its input.`,
    messages: [{ role: "user", content: opts.user }],
    tools: [
      {
        name: "submit",
        description: "Submit the finished result as a JSON object in exactly the shape the instructions describe.",
        input_schema: { type: "object", additionalProperties: true },
      },
    ],
    tool_choice: { type: "tool", name: "submit" },
  });
  const res = await stream.finalMessage();
  const call = res.content.find((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use");
  if (!call) throw new Error(`No structured reply (stop: ${res.stop_reason})`);
  if (res.stop_reason === "max_tokens") throw new Error("Reply was cut off (max_tokens)");
  return call.input as T;
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
      system: `${opts.system}\n\nReply with the JSON only: no preamble, no explanation, no markdown fences. Escape any double quotes inside strings.`,
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
