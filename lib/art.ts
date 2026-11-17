/**
 * Every spot in the app where one of Mikey's drawings can go.
 * Drop a file named `<name>.webp` into /public/art and it replaces the placeholder on the next deploy.
 * Until then each slot shows its fallback (emoji, avatars or the big title).
 */
export type ArtSlot = { name: string; where: string; size: string };

export const ART_SLOTS: ArtSlot[] = [
  { name: "home", where: "Home: the big sky picture at the top", size: "1200 × 1000, transparent" },
  { name: "new-adventure", where: "Home: corner of the “Start a new adventure” card", size: "600 × 600, transparent" },
  { name: "sign-in", where: "Sign-in and invite screens: the sky picture", size: "1200 × 800, transparent" },
  { name: "grownups", where: "Grown-ups: corner of the sky header", size: "600 × 600, transparent" },
  { name: "making", where: "Ask: while an episode is being made", size: "800 × 600, transparent" },
  { name: "lost-voice", where: "When the voice credits run out (Cheko lost his voice)", size: "600 × 600, transparent" },
  { name: "library-empty", where: "Library: when there's nothing to show", size: "600 × 600, transparent" },
  { name: "otto", where: "Otto's round avatar, everywhere", size: "400 × 400, square, face centred" },
  { name: "cheko", where: "Cheko's round avatar (otter), everywhere", size: "400 × 400, square, face centred" },
  { name: "cheko-dino", where: "Cheko's avatar after turning into a dino (same for robot, dragon, doctor, diver)", size: "400 × 400, square" },
];

export const artSrc = (name: string) => `/art/${name}.webp`;
