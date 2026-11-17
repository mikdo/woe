import { Art } from "@/components/SkyPage";

/** Otto and Cheko avatars. Mikey's drawings (/public/art/otto.webp, cheko.webp, cheko-<form>.webp) replace the emoji when they exist. */
const FORM_EMOJI: Record<string, string> = { otter: "🦦", dino: "🦖", robot: "🤖", dragon: "🐉", doctor: "🩺", diver: "🤿" };

export function Otto({ size = 72 }: { size?: number }) {
  return (
    <div
      className="grid place-items-center overflow-hidden rounded-full bg-amber-200 ring-4 ring-white"
      style={{ width: size, height: size, fontSize: size * 0.55 }}
      aria-label="Otto"
    >
      <Art name="otto" className="h-full w-full object-cover" fallback="🧑" />
    </div>
  );
}

export function Cheko({ form = "otter", size = 72 }: { form?: string | null; size?: number }) {
  const f = form ?? "otter";
  const emoji = FORM_EMOJI[f] ?? "🦦";
  const plain = <Art name="cheko" className="h-full w-full object-cover" fallback={emoji} />;
  return (
    <div
      className="grid place-items-center overflow-hidden rounded-full bg-sky-200 ring-4 ring-white"
      style={{ width: size, height: size, fontSize: size * 0.55 }}
      aria-label={`Cheko the ${f}`}
    >
      {f === "otter" ? plain : <Art name={`cheko-${f}`} className="h-full w-full object-cover" fallback={f in FORM_EMOJI ? emoji : plain} />}
    </div>
  );
}
