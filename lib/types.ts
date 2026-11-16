export type Band = "littles" | "bigs" | "explorers";

export const BANDS: { id: Band; label: string; ages: string; colour: string }[] = [
  { id: "littles", label: "Littles", ages: "2–3", colour: "#f472b6" },
  { id: "bigs", label: "Bigs", ages: "4–6", colour: "#38bdf8" },
  { id: "explorers", label: "Explorers", ages: "7–10", colour: "#22c55e" },
];

export type Category =
  | "animals"
  | "ocean"
  | "dinosaurs"
  | "space"
  | "earth"
  | "how-things-work"
  | "my-body"
  | "food-plants"
  | "people-places";

export type ChekoForm = "otter" | "dino" | "robot" | "dragon" | "doctor" | "diver";

export const CATEGORIES: { id: Category; label: string; colour: string; form: ChekoForm; emoji: string }[] = [
  { id: "animals", label: "Animals", colour: "#22c55e", form: "otter", emoji: "🦘" },
  { id: "ocean", label: "Ocean", colour: "#14b8a6", form: "diver", emoji: "🐳" },
  { id: "dinosaurs", label: "Dinosaurs & long ago", colour: "#f97316", form: "dino", emoji: "🦕" },
  { id: "space", label: "Space", colour: "#4f46e5", form: "dragon", emoji: "🚀" },
  { id: "earth", label: "Earth & weather", colour: "#0ea5e9", form: "dragon", emoji: "🌋" },
  { id: "how-things-work", label: "How things work", colour: "#eab308", form: "robot", emoji: "⚙️" },
  { id: "my-body", label: "My body", colour: "#ec4899", form: "doctor", emoji: "❤️" },
  { id: "food-plants", label: "Food & plants", colour: "#65a30d", form: "otter", emoji: "🍎" },
  { id: "people-places", label: "People & places", colour: "#a855f7", form: "otter", emoji: "🌏" },
];

export type Speaker = "otto" | "cheko";

export type Segment = {
  beat:
    | "hello"
    | "hook"
    | "framing"
    | "explainer"
    | "new_word"
    | "recap"
    | "game_tf"
    | "game_quiz"
    | "game_wyr"
    | "game_riddle"
    | "final_answer"
    | "teaser"
    | "signoff";
  lines: { speaker: Speaker; text: string }[];
  facts: string[];
  pause_after_s: number;
  sfx?: "jingle" | "ding" | "boing" | "drumroll" | "poof" | null;
  fx?: string | null;
  fx_path?: string;
  /** Cheko just said "CHANGE-O": play the transformation sound after this segment. */
  transform_after?: boolean;
  answer?: boolean | string | null;
  audio_path?: string;
};

export type Script = {
  title: string;
  category: Category;
  cheko_form: ChekoForm;
  new_words: { word: string; say_as: string }[];
  segments: Segment[];
  art_prompt: string;
  talk_about_it: string[];
  /** Three questions this episode naturally leads to, for "ask more". */
  follow_ups?: string[];
  grownup_fact?: string;
  activities?: Activity[];
  ambience?: string;
  ambience_path?: string;
  sound_done?: boolean;
};

export type Activity = {
  kind: "make" | "move" | "explore" | "draw";
  title: string;
  minutes: number;
  need: string[];
  steps: string[];
  talk: string;
  safety?: string | null;
};

export type Fact = { id: string; fact: string; source_url: string; source_title?: string };

export type ClaimCheck = {
  claim: string;
  verdict: "supported" | "simplified_ok" | "unsupported" | "wrong";
  note: string;
  source_url?: string;
};

export function bandForAge(age: number): Band {
  return age <= 3 ? "littles" : age <= 6 ? "bigs" : "explorers";
}
