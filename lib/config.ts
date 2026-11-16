// Central place for model names and IDs. Every value can be overridden with an env var,
// so a model rename never needs a code change.
export const config = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",

  anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",
  claudeWriter: process.env.CLAUDE_WRITER_MODEL ?? "claude-sonnet-5-5",
  claudeFast: process.env.CLAUDE_FAST_MODEL ?? "claude-haiku-5-5",
  claudeWebSearchTool: process.env.CLAUDE_WEB_SEARCH_TOOL ?? "web_search_20260318",

  geminiKey: process.env.GEMINI_API_KEY ?? "",
  geminiCheckModel: process.env.GEMINI_CHECK_MODEL ?? "gemini-3.8-flash",
  geminiImageModel: process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image",
  geminiEmbedModel: process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001",

  elevenKey: process.env.ELEVENLABS_API_KEY ?? "",
  elevenModel: process.env.ELEVENLABS_MODEL ?? "eleven_v3",
  elevenSttModel: process.env.ELEVENLABS_STT_MODEL ?? "scribe_v1",
  ottoVoiceId: process.env.OTTO_VOICE_ID ?? "",
  chekoVoiceId: process.env.CHEKO_VOICE_ID ?? "",

  adminEmails: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),

  matchThreshold: Number(process.env.MATCH_THRESHOLD ?? "0.82"),
  maxFixLoops: 1,
};

export function missingKeys(): string[] {
  const missing: string[] = [];
  if (!config.supabaseServiceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!config.anthropicKey) missing.push("ANTHROPIC_API_KEY");
  if (!config.geminiKey) missing.push("GEMINI_API_KEY");
  if (!config.elevenKey) missing.push("ELEVENLABS_API_KEY");
  if (!config.ottoVoiceId) missing.push("OTTO_VOICE_ID");
  if (!config.chekoVoiceId) missing.push("CHEKO_VOICE_ID");
  return missing;
}
