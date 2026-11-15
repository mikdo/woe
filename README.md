# WOE! What On Earth?

Kids ask Otto and Cheko a question; the app researches it, writes a fact-checked episode, voices it and adds cover art.

- Next.js 16 PWA on Vercel, Supabase (Postgres + pgvector + Storage + Auth)
- Claude: triage, research (web search), script, claim extraction, pronunciation
- Gemini: independent fact check (Google Search grounding), embeddings for "already asked?", cover art
- ElevenLabs: speech to text, Otto + Cheko voices (text to dialogue), sound kit

## Pipeline
`/api/ask` → triage → match existing episode (pgvector + Claude judge) → monthly limit → new episode in the background:
research → script → fact check (max 2 fix loops, else `needs_review`) → pronunciation → voice + art → personal intro/outro per kid.
Every step is saved, so `/api/episodes/[id]/resume` can pick up a timed-out run.

## Env vars
See `.env.example`.
