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

/** Ask Claude for JSON. Optionally lets it search the web (server tool). */
export async function claudeJson<T>(opts: {
  model?: string;
  system: string;
  user: string;
  webSearch?: boolean;
  maxTokens?: number;
}): Promise<T> {
  const tools = opts.webSearch
    ? ([{ type: config.claudeWebSearchTool, name: "web_search", max_uses: 6 }] as unknown as Anthropic.Messages.ToolUnion[])
    : undefined;

  const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: opts.user }];
  let text = "";
  // Server tools can pause a long turn; continue it a few times if so.
  for (let i = 0; i < 4; i++) {
    const res = await anthropic().messages.create({
      model: opts.model ?? config.claudeWriter,
      max_tokens: opts.maxTokens ?? 8000,
      system: opts.system,
      messages,
      ...(tools ? { tools } : {}),
    });
    text += res.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    if (res.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: res.content });
  }
  return extractJson<T>(text);
}
