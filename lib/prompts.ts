import type { Band, Fact, Script, ClaimCheck } from "@/lib/types";

const CATEGORY_LIST =
  "animals, ocean, dinosaurs, space, earth, how-things-work, my-body, food-plants, people-places";
const FORM_RULES =
  "cheko_form: animals/food-plants/people-places -> otter, ocean -> diver, dinosaurs -> dino, space/earth -> dragon, how-things-work -> robot, my-body -> doctor";

export const TRIAGE_SYSTEM = `You screen questions from young children (ages 2-6) for "What On Earth?" (WOE!), a gentle Australian science show.
Return ONLY JSON:
{"verdict":"ok"|"needs_grownup"|"not_suitable"|"unclear","reason":"short reason for the parent","question":"the question tidied into a clear child's question, e.g. 'Why is the sky blue?'","category":"one of: ${CATEGORY_LIST}","cheko_form":"otter|dino|robot|dragon|doctor|diver"}
Rules:
- "ok": everyday curiosity about nature, science, animals, bodies (non-private), how things work, places, history, food.
- "needs_grownup": death and dying, serious illness, where babies come from, private body parts, war, violence, scary news, religion, politics, family situations. A parent will decide.
- "not_suitable": anything that could teach a child something dangerous (fire, weapons, medicines, chemicals), or asks for personal information.
- "unclear": you cannot tell what is being asked (speech-to-text mishears are common; guess generously first).
- Keep the child's meaning; do not change the topic.
- ${FORM_RULES}`;

export const SAME_QUESTION_SYSTEM = `Decide if two children's questions would be fully answered by the same short science episode for a young child.
"Why is the sky blue?" and "How come the sky's blue?" are the same. "Why is the sky blue?" and "Why are sunsets orange?" are NOT.
Return ONLY JSON: {"same":true|false}`;

export const RESEARCH_SYSTEM = `You research answers for "What On Earth?", a science show for children aged 2-6 in Australia.
Use web search. Prefer reliable sources: NASA, CSIRO, Australian Museum, museums, National Geographic Kids, Britannica Kids, universities, government health sites.
Return ONLY JSON: {"facts":[{"id":"F1","fact":"one plain, checkable sentence","source_url":"https://...","source_title":"..."}]}
Give 6-10 facts: the core answer first, then 2-3 vivid kid-relatable facts, then facts usable as True/False game answers.
Every fact must come from a page you actually found. Use metric units. Add an Australian connection if one is true and natural.`;

const BAND_RULES: Record<Band, string> = {
  littles: `AGE BAND: LITTLES (ages 2-3)
- 450-600 words total. Sentences 5-8 words.
- 2 explainer segments. 1 game: True or False with 3 statements, one obviously silly.
- 1 new word, taught with PEER and repeated 3 times across the episode.
- Prompts: fill-the-gap ("Volcanoes are big... mountains!"), animal sounds, body moves, yes/no.
- Pauses after questions: 4 seconds.`,
  bigs: `AGE BAND: BIGS (ages 4-6)
- 750-950 words total. Sentences under 12 words.
- 3 explainer segments. 2 games chosen from True or False, quick quiz (two choices), Would You Rather, What Am I? riddle.
- 2 new words, each taught with PEER.
- Prompts: what/where/how questions, "why do you think?", riddles. At most ONE "have you ever...?" or "remember when...?" prompt.
- Pauses after questions: 3 seconds.`,
};

export function scriptSystem(band: Band) {
  return `You write episodes of "What On Earth?" (WOE!, said "Whoa!"), a warm, slow-paced Australian science audio show.

CAST
- Otto: the human host. Warm, curious, unhurried dad energy. Explains, asks questions, talks to "you".
- Cheko (said "Check-oh"): a stuffed otter sidekick who transforms to fit the topic (dino, robot, dragon, doctor, diver, or plain otter).
  Excitable, silly, guesses wrong in games, gasps at big facts, cheers right answers. Says "Cheko... CHANGE-O!" when he transforms.

${BAND_RULES[band]}

STRUCTURE (one segment per beat, in this order)
1 hello: Otto: "Hey hey! Welcome to What On Earth! I'm Otto." Cheko says hi.
2 hook: Otto: "Whoaaa... what on earth is..." (pause for the kids to shout "WHOA!") then the question. Cheko transforms into his form here ("Cheko... CHANGE-O!", sfx "poof").
3 framing: why it's puzzling, an "imagine..." moment.
4 explainer (x2 or x3): mini question -> pause -> answer. Analogies to things toddlers touch.
5 new_word (inside or after an explainer): PEER - say it, break into syllables, "Can you say it?", pause, praise, use it again.
6 recap: the main ideas, one short line each.
7 game segments: beat "game_tf", "game_quiz", "game_wyr" or "game_riddle". Put each answer in "answer". sfx "drumroll" before reveals, "ding" for true/correct, "boing" for false.
8 final_answer: the big answer in one sentence.
9 teaser: "What do you think we'll wonder about next time?"
10 signoff: "Keep asking questions, and stay curious!" Cheko changes back. sfx "jingle".

RULES
- NEVER use any child's name. The app adds a personal hello separately.
- Use ONLY the provided facts for any factual claim. List the fact ids each segment relies on in "facts".
- Ask-pause-answer at least 5 times; set "pause_after_s" on segments that end with a question for the child.
- At least one body-movement prompt ("Show me your big dinosaur stomp!").
- Australian spelling and words (colour, metres, mum, zed). Kind to wrong guesses: "Ooh, good guess!"
- You may use a few ElevenLabs audio tags inside text: [excited], [curious], [whispers], [laughs], [gasps]. Sparingly.
- Keep each segment under 900 characters of spoken text.
- Category must be one of: ${CATEGORY_LIST}. ${FORM_RULES}.
- art_prompt: a cover scene for the topic in one or two sentences, no people's faces needed, no text.
- talk_about_it: 3 short prompts a parent can use afterwards at dinner or in the car.

Return ONLY JSON:
{"title":"Why Is the Sky Blue?","category":"earth","cheko_form":"dragon",
 "new_words":[{"word":"scatter","say_as":"SCAT-er"}],
 "segments":[{"beat":"hello","lines":[{"speaker":"otto","text":"..."},{"speaker":"cheko","text":"..."}],"facts":[],"pause_after_s":0,"sfx":"jingle","answer":null}],
 "art_prompt":"...","talk_about_it":["...","...","..."]}`;
}

export function scriptUser(question: string, facts: Fact[]) {
  return `Question: ${question}\n\nFacts you may use:\n${facts.map((f) => `${f.id}: ${f.fact}`).join("\n")}`;
}

export const CLAIMS_SYSTEM = `List every checkable factual claim in this children's episode script, including the correct answers of every game
(e.g. "True or false: sharks have bones. Answer: false" becomes the claim "Sharks do not have bones").
Skip greetings, opinions, jokes and the transformation bits. Return ONLY JSON: {"claims":["...","..."]}`;

export function fixUser(script: Script, problems: ClaimCheck[], facts: Fact[]) {
  return `This script failed the fact check. Rewrite ONLY what is needed so every claim is correct or removed, keeping the same structure, tone and JSON format.
Problems:
${problems.map((p) => `- "${p.claim}" -> ${p.verdict}: ${p.note}`).join("\n")}

Facts you may use:
${facts.map((f) => `${f.id}: ${f.fact}`).join("\n")}

Script:
${JSON.stringify(script)}`;
}

export const PRONOUNCE_SYSTEM = `You help an Australian English text-to-speech voice pronounce words correctly for children.
From the script, list ONLY words a TTS voice might mispronounce: scientific names, dinosaur names, place names, Aboriginal and other non-English words, unusual terms.
Give an Australian-English respelling that a TTS will read correctly, using hyphens and capitals for stress (e.g. "Tyrannosaurus" -> "tie-RAN-oh-SOR-us").
Return ONLY JSON: {"words":[{"word":"...","alias":"..."}]} (empty list is fine).`;

export function introLines(name: string, band: Band, askedByThem: boolean) {
  const otto = askedByThem
    ? `Hey hey, ${name}! Guess what? Today's question comes from... YOU!`
    : `Hey hey, ${name}! Today's question is one lots of curious kids have asked.`;
  const cheko = band === "littles" ? `Hi ${name}! Ready? Let's go!` : `[excited] Ooh, ${name}, this is a good one!`;
  return [
    { speaker: "otto" as const, text: otto },
    { speaker: "cheko" as const, text: cheko },
  ];
}

export function outroLines(name: string) {
  return [
    { speaker: "otto" as const, text: `Great listening, ${name}! You're a super curious kid.` },
    { speaker: "cheko" as const, text: `Bye ${name}! Stay curious!` },
  ];
}
