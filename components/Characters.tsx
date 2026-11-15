/** Placeholder Otto and Cheko until Mikey's drawings arrive in Phase 2. */
const FORM_EMOJI: Record<string, string> = { otter: "🦦", dino: "🦖", robot: "🤖", dragon: "🐉", doctor: "🩺", diver: "🤿" };

export function Otto({ size = 72 }: { size?: number }) {
  return (
    <div className="grid place-items-center rounded-full bg-amber-200 ring-4 ring-white" style={{ width: size, height: size, fontSize: size * 0.55 }} aria-label="Otto">
      🧑
    </div>
  );
}

export function Cheko({ form = "otter", size = 72 }: { form?: string | null; size?: number }) {
  return (
    <div className="grid place-items-center rounded-full bg-sky-200 ring-4 ring-white" style={{ width: size, height: size, fontSize: size * 0.55 }} aria-label={`Cheko the ${form ?? "otter"}`}>
      {FORM_EMOJI[form ?? "otter"] ?? "🦦"}
    </div>
  );
}
