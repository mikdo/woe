// JSON schemas for Claude's structured outputs (strict: every key required, no extras).
const str = { type: "string" };
const strArr = { type: "array", items: str };
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const TRIAGE_SCHEMA = obj({
  verdict: { type: "string", enum: ["ok", "needs_grownup", "not_suitable", "unclear"] },
  reason: str,
  question: str,
  category: str,
  cheko_form: { type: "string", enum: ["otter", "dino", "robot", "dragon", "doctor", "diver"] },
});

export const SAME_SCHEMA = obj({ same: { type: "boolean" } });

export const CLAIMS_SCHEMA = obj({ claims: strArr });

export const PRONOUNCE_SCHEMA = obj({ words: { type: "array", items: obj({ word: str, alias: str }) } });

export const SCRIPT_SCHEMA = obj({
  title: str,
  category: str,
  cheko_form: { type: "string", enum: ["otter", "dino", "robot", "dragon", "doctor", "diver"] },
  new_words: { type: "array", items: obj({ word: str, say_as: str }) },
  segments: {
    type: "array",
    items: obj({
      beat: str,
      lines: { type: "array", items: obj({ speaker: { type: "string", enum: ["otto", "cheko"] }, text: str }) },
      facts: strArr,
      pause_after_s: { type: "number" },
      sfx: nullable({ type: "string", enum: ["jingle", "ding", "boing", "drumroll", "poof"] }),
      fx: nullable(str),
      answer: nullable(str),
    }),
  },
  ambience: str,
  art_prompt: str,
  talk_about_it: strArr,
  grownup_fact: str,
  activities: {
    type: "array",
    items: obj({
      kind: { type: "string", enum: ["make", "move", "explore", "draw"] },
      title: str,
      minutes: { type: "number" },
      need: strArr,
      steps: strArr,
      talk: str,
      safety: nullable(str),
    }),
  },
});

/** A fact-check fix: only the segments that change, so nothing else can get lost. */
export const FIX_SCHEMA = obj({
  edits: {
    type: "array",
    items: obj({
      segment: { type: "integer" },
      lines: { type: "array", items: obj({ speaker: { type: "string", enum: ["otto", "cheko"] }, text: str }) },
      answer: nullable(str),
    }),
  },
  grownup_fact: nullable(str),
});
