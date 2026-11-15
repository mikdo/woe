"use client";
import { useState } from "react";

const KEY = "woe-grownup-until";

export function isGrownUpUnlocked() {
  if (typeof window === "undefined") return false;
  return Number(sessionStorage.getItem(KEY) ?? 0) > Date.now();
}

/** Simple "grown-ups only" sum, the usual pattern in kids' apps. Unlocks for 10 minutes. */
export function GrownUpGate({ onPass, onCancel }: { onPass: () => void; onCancel: () => void }) {
  const [[a, b]] = useState(() => [6 + Math.floor(Math.random() * 7), 5 + Math.floor(Math.random() * 8)]);
  const [value, setValue] = useState("");
  const [wrong, setWrong] = useState(false);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-6">
      <div className="card w-full max-w-sm text-center">
        <h2 className="text-2xl font-semibold">Grown-ups only</h2>
        <p className="mt-2 text-slate-600">What is {a} + {b}?</p>
        <input
          className="input mt-4 text-center text-2xl"
          inputMode="numeric"
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setWrong(false);
          }}
        />
        {wrong && <p className="mt-2 text-sm text-red-600">Not quite, try again.</p>}
        <div className="mt-5 flex justify-center gap-3">
          <button className="btn-soft" onClick={onCancel}>Cancel</button>
          <button
            className="btn-primary"
            onClick={() => {
              if (Number(value) === a + b) {
                sessionStorage.setItem(KEY, String(Date.now() + 10 * 60 * 1000));
                onPass();
              } else setWrong(true);
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
