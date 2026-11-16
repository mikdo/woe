import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { jsonrepair } from "jsonrepair";
import { config } from "@/lib/config";
import { addTokens } from "@/lib/ai/cost";

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
 * Ask Claude for JSON. With a schema (and no web search) Claude's structured outputs guarantee valid JSON;
 * otherwise the text is parsed with a repair fallback. Retries once.
 */
export async function claudeJson<T>(opts: {
  model?: string;
  system: string;
  user: string;
  webSearch?: boolean;
  maxTokens?: number;
  schema?: Record<string, unknown>;
}): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const maxTokens = Math.min((opts.maxTokens ?? 8000) * (attempt + 1), 64000);
    const { text, stop } = await claudeText({ ...opts, maxTokens }).catch((e) => {
      lastErr = e;
      return { text: "", stop: "error" as string | null };
    });
    if (stop === "error") continue;
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
  schema?: Record<string, unknown>;
}): Promise<{ text: string; stop: string | null }> {
  const tools = opts.webSearch
    ? ([{ type: config.claudeWebSearchTool, name: "web_search", max_uses: 4 }] as unknown as Anthropic.Messages.ToolUnion[])
    : undefined;
  const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: opts.user }];
  let text = "";
  let stop: string | null = null;
  // Server tools can pause a long turn; continue it a few times if so.
  for (let i = 0; i < 4; i++) {
    const stream = anthropic().messages.stream({
      model: opts.model ?? config.claudeWriter,
      max_tokens: Math.min(opts.maxTokens ?? 8000, 64000),
      // The long instructions are cached, so repeat calls pay a fraction for them.
      system: [
        {
          type: "text",
          text: `${opts.system}\n\nReply with the JSON only: no preamble, no explanation, no markdown fences. Escape any double quotes inside strings.`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages,
      ...(tools ? { tools } : {}),
      ...(opts.schema && !tools ? { output_config: { format: { type: "json_schema" as const, schema: opts.schema } } } : {}),
    });
    const res = await stream.finalMessage();
    const u = res.usage as Anthropic.Messages.Usage & { server_tool_use?: { web_search_requests?: number } | null };
    addTokens(opts.model ?? config.claudeWriter, {
      in: u.input_tokens ?? 0,
      out: u.output_tokens ?? 0,
      cacheRead: u.cache_read_input_tokens ?? 0,
      cacheWrite: u.cache_creation_input_tokens ?? 0,
      searches: u.server_tool_use?.web_search_requests ?? 0,
    });
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
