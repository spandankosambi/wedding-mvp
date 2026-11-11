"use client";

import { useState } from "react";

/** The story box with a live count, so it stays short enough for one screen. */
export function StoryField({ initial, max }: { initial: string; max: number }) {
  const [text, setText] = useState(initial);
  const n = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const over = n > max;
  return (
    <>
      <textarea
        name="story" value={text} onChange={(e) => setText(e.target.value)} rows={5}
        aria-describedby="story-count" aria-invalid={over || undefined}
        className="portal-input resize-y"
        placeholder="They met over a spilled filter coffee at a Bengaluru hackathon…"
      />
      <p id="story-count" className={`mt-1 text-xs ${over ? "font-medium text-red-700" : "text-neutral-500"}`} data-testid="story-count">
        {n.toLocaleString("en-IN")} / {max} characters · about {words} words
        {over ? ` — please shorten it by ${n - max} so it fits one screen` : " — keeps the whole story on one screen"}
      </p>
    </>
  );
}
