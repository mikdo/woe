/** Friendly labels for each step of making an episode, in order. */
export const STAGES: Record<string, string> = {
  queued: "Otto is opening his big book…",
  researching: "Otto is looking it up…",
  writing: "Otto and Cheko are writing it…",
  checking: "Double-checking every fact…",
  fixing: "Fixing a fact to make it just right…",
  pronouncing: "Practising the tricky words…",
  recording: "Cheko is warming up his voice…",
  continuing: "Still recording…",
  sound: "Adding the sounds and music…",
  resuming: "Picking up where we left off…",
};

const ORDER = ["queued", "researching", "writing", "checking", "fixing", "pronouncing", "recording", "continuing", "sound", "ready"];

/** Rough progress 0..1 for a stage. */
export function stageProgress(stage: string | null | undefined) {
  const i = ORDER.indexOf(stage ?? "queued");
  return i < 0 ? 0.1 : Math.max(0.06, i / (ORDER.length - 1));
}
