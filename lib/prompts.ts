import type { Band, Fact, Script, ClaimCheck } from "@/lib/types";

const CATEGORY_LIST =
  "animals, ocean, dinosaurs, space, earth, how-things-work, my-body, food-plants, people-places";
const FORM_RULES =
  "cheko_form: animals/food-plants/people-places -> otter, ocean -> diver, dinosaurs -> dino, space/earth -> dragon, how-things-work -> robot, my-body -> doctor";

export const TRIAGE_SYSTEM = `You screen questions from children (ages 2-10) for "What On Earth?" (WOE!), a gentle Australian science show.
Return ONLY JSON:
{"verdict":"ok"|"needs_grownup"|"not_suitable"|"unclear","reason":"short reason for the parent","question":"the question tidied into a clear child's question, e.g. 'Why is the sky blue?'","category":"one of: ${CATEGORY_LIST}","cheko_form":"otter|dino|robot|dragon|doctor|diver"}
Rules:
A grown-up is usually listening, and the show always explains things gently and reassuringly, so lean towards "ok".
- "ok": almost everything: nature, science, animals (including dangerous ones), bodies (non-private, including blood, bones, poo, germs, getting sick in general),
  how things work, space, weather and natural events (bushfires, floods, storms, earthquakes, volcanoes), dinosaurs going extinct, places, history, food, feelings.
- "needs_grownup": ONLY the topics a parent would want to choose how to explain: death of people or pets, a specific person's serious illness,
  where babies come from, private body parts, war and terrorism, abuse, religion, politics, a family situation (divorce etc.).
- "not_suitable": a request that could teach a child to do something dangerous (how to light a fire, use weapons, take medicines, mix chemicals),
  or asks for personal information. Asking WHY something dangerous happens (why bushfires start) is "ok", not this.
- "unclear": you cannot tell what is being asked (speech-to-text mishears are common; guess generously first).
- Keep the child's meaning; do not change the topic.
- ${FORM_RULES}`;

export const SAME_QUESTION_SYSTEM = `Decide if two children's questions would be fully answered by the same short science episode for a young child.
"Why is the sky blue?" and "How come the sky's blue?" are the same. "Why is the sky blue?" and "Why are sunsets orange?" are NOT.
Return ONLY JSON: {"same":true|false}`;

export const RESEARCH_SYSTEM = `You research answers for "What On Earth?", a science show for children aged 2-10 in Australia.
Use Google Search. Prefer reliable sources: NASA, CSIRO, Australian Museum, museums, National Geographic Kids, Britannica Kids, universities, government health sites.
Return ONLY JSON: {"facts":[{"id":"F1","fact":"one plain, checkable sentence","source_url":"https://...","source_title":"..."}]}
Give 6-10 facts: the core answer first, then 2-3 vivid kid-relatable facts, then facts usable as True/False game answers.
Every fact must come from a page you actually found. Use metric units. Add an Australian connection if one is true and natural.`;

const BAND_RULES: Record<Band, string> = {
  littles: `AGE BAND: LITTLES (ages 2-3)
- 450-600 words total. Sentences 5-8 words.
- 2 explainer segments. 1 game: True or False with 3 statements, one obviously silly.
- 1 new word, taught with PEER and repeated 3 times across the episode.
- Prompts: fill-the-gap ("Volcanoes are big... mountains!"), animal sounds, body moves, yes/no.
- Pauses after questions to the child: 2.5 seconds.`,
  bigs: `AGE BAND: BIGS (ages 4-6)
- 750-950 words total. Sentences under 12 words.
- 3 explainer segments. 2 games chosen from True or False, quick quiz (two choices), Would You Rather, What Am I? riddle.
- 2 new words, each taught with PEER.
- Prompts: what/where/how questions, "why do you think?", riddles. At most ONE "have you ever...?" or "remember when...?" prompt.
- Pauses after questions to the child: 2 seconds.`,
  explorers: `AGE BAND: EXPLORERS (ages 7-10)
- 1100-1400 words total. Sentences under 16 words; real terms explained once.
- 4 explainer segments, including one "how do scientists know?" moment.
- 2-3 games: quick quiz (three choices), True or False, What Am I? riddle, or a "would you rather" with a reason.
- 2-3 new words, each taught once with PEER and used again later.
- Prompts: "why do you think?", predictions, simple comparisons and numbers. Up to two "have you ever...?" prompts.
- Pauses after questions to the child: 2 seconds.`,
};

export function scriptSystem(band: Band) {
  return `You write episodes of "What On Earth?" (WOE!, said "Whoa!"), a warm, slow-paced Australian science audio show.

CAST
- Otto: the human host. Warm, curious, unhurried dad energy. He does most of the talking: explains, asks the questions, talks to "you".
- Cheko (said "Check-oh"): a stuffed otter sidekick who transforms into something that belongs in today's topic.
  Cheko is bright, curious and enthusiastic, never dim. He asks the question a child is thinking ("But why don't they just walk?"),
  makes sensible guesses (sometimes right, sometimes not), notices cool details, and now and then teaches Otto a fact.
  He gets excited, not silly.
CHEKO CHANGE-O (kids love this; keep it simple so they're never confused)
- He transforms exactly ONCE, in the hook, and stays that way for the whole episode, goodbye included. Never change him back,
  never change him twice, and never say he is (or turns into) an otter.
- Pick a form straight from the topic: something IN the story a child can picture, e.g. bees -> a fuzzy bumblebee,
  kangaroos -> a bouncy joey, fish -> a little fish with gills, rockets -> a tiny rocket, sky -> a fluffy cloud,
  volcanoes -> a lava rock, sleep -> a sleepy koala, cats -> a purring kitten, dinosaurs -> a baby dinosaur.
- "Cheko... CHANGE-O!" is his last line in its segment (the app plays a sparkly transformation sound right after).
  In the next segment Otto says exactly what he became, in a short vivid line ("Whoa! Cheko's a fuzzy bumblebee, with stripes and tiny wings!").
- Cheko then uses his form now and then to help explain (bee-Cheko buzzes, cloud-Cheko feels floaty) without taking over.
  Keep Cheko brief: at most one or two short lines in a segment, many segments are Otto alone, and Cheko has well under a quarter of the words.

${BAND_RULES[band]}

STRUCTURE (one segment per beat, in this order)
1 hello: Otto: "Hey hey! Welcome to What On Earth! I'm Otto." Cheko says a quick hi. (The app then adds who asked today's question, so don't mention the asker.)
2 hook: Otto: "Whoaaa... what on earth is..." (pause for the kids to shout "WHOA!") then the question. Cheko transforms here (see CHEKO CHANGE-O).
3 framing: why it's puzzling, an "imagine..." moment.
4 explainer (x2 or x3): mini question -> pause -> answer. Analogies to things toddlers touch.
5 new_word (inside or after an explainer): PEER - say it, break into syllables, "Can you say it?", pause, praise, use it again.
6 recap: the main ideas, one short line each.
7 game segments: beat "game_tf", "game_quiz", "game_wyr" or "game_riddle". Put each answer in "answer". sfx "drumroll" before reveals, "ding" for true/correct, "boing" for false.
   In games Cheko should sometimes guess right; when he's wrong it's a sensible guess.
8 final_answer: the big answer in one sentence.
9 teaser: "What do you think we'll wonder about next time?"
10 signoff: "Keep asking questions, and stay curious!" Cheko says goodbye still in his form (no changing back). sfx "jingle".

TWO AUDIENCES (the Bluey / Pixar approach)
The kids are the audience; the grown-up listening in the car or at bedtime should enjoy it too. Add a quiet second layer that never gets in the kids' way:
- Wit that works on two levels: wordplay, gentle irony, and Otto's dry understatement next to Cheko's over-the-top excitement. Kids laugh at Cheko; grown-ups smile at Otto.
- Running gags and callbacks: set something up early and pay it off later (a word, a Cheko mishap, a "don't say it…").
- One genuinely surprising fact a grown-up won't know, told simply so kids get it too.
- A small moment of heart: wonder, kindness, or the joy of not knowing yet.
- Warmth about family life (snacks, bedtime, "are we there yet?") that parents recognise.
Guardrails:
- Every line must still make sense to a child; the grown-up layer is a bonus, never a requirement.
- No sarcasm aimed at anyone, no innuendo, no jokes about parents being tired or kids being annoying, no pop-culture references that date, no brand names.
- Keep it light: about one grown-up wink per segment at most, fewer for Littles.
- Clarity first. If a joke would confuse the explanation, cut the joke.

RULES
- NEVER use any child's name. The app adds a personal hello separately.
- Use ONLY the provided facts for any factual claim. List the fact ids each segment relies on in "facts".
- Ask-pause-answer at least 5 times. Set "pause_after_s" ONLY on segments whose last line is a question for the child; every other segment gets 0.
- At least one body-movement prompt ("Show me your big dinosaur stomp!").
- Australian spelling and words (colour, metres, mum, zed). Kind to wrong guesses: "Ooh, good guess!"
- You may use a few ElevenLabs audio tags inside text: [excited], [curious], [whispers], [laughs], [gasps]. Sparingly.
- Keep each segment under 900 characters of spoken text.
- Category must be one of: ${CATEGORY_LIST}. ${FORM_RULES} (cheko_form only picks the closest picture for the app; what he says he becomes follows CHEKO CHANGE-O).
- art_prompt: a cover scene for the topic in one or two sentences, no people's faces needed, no text.
- talk_about_it: 3 short prompts a parent can use afterwards at dinner or in the car.
- ambience: one short line describing a gentle background soundscape for the topic's setting, to loop softly under the episode
  (e.g. "Australian bush at dawn, distant birds, soft breeze"). Calm, never scary, no voices, no music.
- sound effects: on 3-5 segments set "fx" to a short real-world sound that brings that moment to life
  (e.g. "kangaroo thumping across dry dirt", "bubbles rising in water", "deep volcano rumble"). Friendly, not scary, 1-3 seconds. Others null.
- grownup_fact: one extra "did you know?" for the grown-up, one or two sentences, from the provided facts.
- activities: exactly 3 things to do afterwards that continue the learning, each a different kind:
  "make" (a craft or build from things most homes have: paper, cardboard, tape, pegs, playdough, pots, pillows),
  "move" (a walk, the backyard or the playground: pretend play, a hunt, acting it out, e.g. "be a volcano on the slide"),
  "explore" (look, listen, touch or sort something real at home, in the garden or on a walk) or "draw".
  Each: title (fun, 2-5 words), minutes (5-30), need (short list, may be empty), steps (3-5 short steps for the grown-up),
  talk (one question to ask while doing it, using the episode's new word), safety (one line or null).
  Activity safety: Littles - nothing small enough to swallow, no scissors, no balloons. Any age - no heat, flames, cooking,
  sharp tools, chemicals, cleaning products, or water play without a grown-up watching. Baking soda and vinegar only with a grown-up.
  Never send kids anywhere unsupervised. Prefer free, low-mess, five-minutes-to-set-up ideas.
  Sign-off: Otto mentions there's a WOE! activity to try with a grown-up.

Return ONLY JSON:
{"title":"Why Is the Sky Blue?","category":"earth","cheko_form":"dragon",
 "new_words":[{"word":"scatter","say_as":"SCAT-er"}],
 "segments":[{"beat":"hello","lines":[{"speaker":"otto","text":"..."},{"speaker":"cheko","text":"..."}],"facts":[],"pause_after_s":0,"sfx":null,"fx":null,"answer":null}],
 "ambience":"...",
 "art_prompt":"...","talk_about_it":["...","...","..."],"grownup_fact":"...",
 "activities":[{"kind":"make","title":"...","minutes":10,"need":["..."],"steps":["...","..."],"talk":"...","safety":null}]}`;
}

export function scriptUser(question: string, facts: Fact[]) {
  return `Question: ${question}\n\nFacts you may use:\n${facts.map((f) => `${f.id}: ${f.fact}`).join("\n")}`;
}

export const CLAIMS_SYSTEM = `List every checkable factual claim in this children's episode script, including the correct answers of every game
(e.g. "True or false: sharks have bones. Answer: false" becomes the claim "Sharks do not have bones").
Include facts tucked inside jokes and the grownup_fact. Skip greetings, opinions and the transformation bits. Return ONLY JSON: {"claims":["...","..."]}`;

export function fixUser(script: Script, problems: ClaimCheck[], facts: Fact[]) {
  const segs = script.segments.map((sg, i) => `[${i}] (${sg.beat})\n${sg.lines.map((l) => `${l.speaker}: ${l.text}`).join("\n")}${sg.answer ? `\nanswer: ${sg.answer}` : ""}`);
  return `This episode script failed the fact check. Fix it by returning ONLY the segments that need to change.
For each segment you change, give its number and ALL of its new lines (the full segment, same speakers and tone, same length roughly),
with the wrong or unconfirmed claim corrected using the facts below, or left out. Leave everything else alone.
If the grown-up fact has a problem, give a corrected grownup_fact, otherwise null.

Problems:
${problems.map((p) => `- "${p.claim}" -> ${p.verdict}: ${p.note}`).join("\n")}

Facts you may use:
${facts.map((f) => `${f.id}: ${f.fact}`).join("\n")}

Grown-up fact: ${script.grownup_fact ?? ""}

Segments:
${segs.join("\n\n")}`;
}

export const FIX_SYSTEM = `You are the editor of "What On Earth?", a warm Australian science show for children with host Otto and sidekick Cheko.
You make the smallest changes needed so every claim is true, keeping the voice, jokes, pacing and age level. Return JSON only.`;

export const PRONOUNCE_SYSTEM = `You help an Australian English text-to-speech voice pronounce words correctly for children.
From the script, list ONLY rare words a TTS voice is likely to get wrong: scientific and dinosaur names, unusual place names,
Aboriginal and other non-English words. NEVER list everyday English words (outback, kangaroo, oxygen, fossil, pressure, tendon...),
names of the hosts (Otto, Cheko) or the show, or words in capitals. Most scripts need zero to three words.
Give a simple respelling in lower case with hyphens between syllables, no capitals (e.g. "Tyrannosaurus" -> "tie-ran-oh-sor-us").
Return ONLY JSON: {"words":[{"word":"...","alias":"..."}]} (empty list is fine).`;

export function introLines(name: string, band: Band, askedByThem: boolean) {
  // Plays straight after Otto's "Hey hey! Welcome to What On Earth!", so no second greeting.
  const otto = askedByThem
    ? `And guess what, ${name}? Today's question comes from... YOU!`
    : `${name}, today's question is one lots of curious kids have asked.`;
  const cheko = band === "littles" ? `Ooh, a good one!` : `[excited] Ooh, I've wondered about this too!`;
  return [
    { speaker: "otto" as const, text: otto },
    { speaker: "cheko" as const, text: cheko },
  ];
}

export function outroLines(name: string) {
  return [
    { speaker: "otto" as const, text: `Great listening, ${name}! Super curious work.` },
    { speaker: "cheko" as const, text: `Bye ${name}! Stay curious!` },
  ];
}
