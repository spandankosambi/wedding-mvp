"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The opening screen, when the family chose one: a sealed envelope or a pair
 * of palace doors over the site, opened with a tap. Opened once per visit
 * (remembered for the browser tab); with reduced motion it simply fades.
 */
export function Reveal({ kind, slug, first, second, line }: {
  kind: "envelope" | "doors"; slug: string; first: string; second: string;
  /** e.g. "29 January 2027 · Pune" */
  line: string;
}) {
  const [state, setState] = useState<"closed" | "opening" | "gone">("closed");
  const btn = useRef<HTMLButtonElement | null>(null);
  const key = `reveal:${slug}`;

  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem(key) === "1"; } catch { /* private mode: show it */ }
    if (seen) setState("gone");
  }, [key]);

  // the site underneath doesn't scroll until it's opened
  useEffect(() => {
    if (state === "gone") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [state]);

  function open() {
    if (state !== "closed") return;
    try { sessionStorage.setItem(key, "1"); } catch { /* fine */ }
    setState("opening");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => setState("gone"), reduce ? 250 : 1500);
  }

  if (state === "gone") return null;
  const initials = `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
  return (
    <div className={`reveal-screen reveal-${kind} ${state === "opening" ? "is-opening" : ""}`} data-testid="reveal" role="dialog" aria-modal="true" aria-label="Your invitation">
      {kind === "doors" ? (
        <>
          <div className="reveal-door reveal-door-l" aria-hidden><span className="reveal-door-panel" /></div>
          <div className="reveal-door reveal-door-r" aria-hidden><span className="reveal-door-panel" /></div>
        </>
      ) : (
        <div className="reveal-env" aria-hidden>
          <span className="reveal-env-flap" />
          <span className="reveal-env-fold" />
        </div>
      )}
      <div className="reveal-centre">
        <p className="kicker reveal-fade">You are invited</p>
        <p className="font-display reveal-fade reveal-names">{first} <em>&amp;</em> {second}</p>
        <button ref={btn} type="button" onClick={open} className="reveal-seal" autoFocus aria-label="Open the invitation">
          <span aria-hidden>{initials}</span>
        </button>
        <p className="reveal-fade reveal-hint">Tap the seal to open</p>
        <p className="kicker reveal-fade" style={{ opacity: 0.7 }}>{line}</p>
      </div>
    </div>
  );
}
