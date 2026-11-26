"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TourId, TourStep } from "@/lib/tours/tours";
import { markTourAction } from "./actions";

/*
 * A page's tour: a "?" button in the corner, and the steps themselves.
 * On a phone each step is a card along the bottom with the thing it's about
 * scrolled into view and outlined; on a wider screen the card sits beside it.
 * Steps whose target isn't on screen for this person are left out.
 */

const shown = (el: Element | null): el is HTMLElement => !!el && (el as HTMLElement).getClientRects().length > 0;
const reduceMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function TourRunner({ id, steps, autoStart }: { id: TourId; steps: TourStep[]; autoStart: boolean }) {
  const [live, setLive] = useState<TourStep[] | null>(null);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [wide, setWide] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  const start = useCallback(() => {
    const now = steps.filter((s) => !s.target || shown(document.querySelector(s.target)));
    if (!now.length) return;
    opener.current = document.activeElement;
    setI(0);
    setLive(now);
  }, [steps]);

  const close = useCallback((how: "finished" | "skipped") => {
    setLive(null);
    setRect(null);
    try { sessionStorage.setItem(`tour:${id}`, "1"); } catch { /* private mode */ }
    markTourAction({ tour: id, how }).catch(() => { /* offline: it'll be offered again next time */ });
    (opener.current as HTMLElement | null)?.focus?.();
  }, [id]);

  // the first time someone opens this page
  useEffect(() => {
    if (!autoStart) return;
    let seen = false;
    try { seen = sessionStorage.getItem(`tour:${id}`) === "1"; } catch { /* private mode */ }
    if (seen) return;
    const t = setTimeout(start, 700);
    return () => clearTimeout(t);
  }, [autoStart, id, start]);

  const step = live?.[i];

  // bring the step's target into view and keep the outline on it
  useLayoutEffect(() => {
    if (!step) return;
    setWide(window.innerWidth >= 640);
    const el = step.target ? document.querySelector(step.target) : null;
    if (!shown(el)) { setRect(null); return; }
    const behavior = reduceMotion() ? "auto" : "smooth";
    // on a phone the card covers the bottom, so the target goes near the top, under the bars that stay put
    if (window.innerWidth < 640) window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 150), behavior });
    else el.scrollIntoView({ block: "center", behavior });
    const measure = () => { setRect(el.getBoundingClientRect()); setWide(window.innerWidth >= 640); };
    measure();
    const t = setTimeout(measure, 350);
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => { clearTimeout(t); window.removeEventListener("scroll", measure); window.removeEventListener("resize", measure); };
  }, [step]);

  useEffect(() => { if (step) card.current?.querySelector<HTMLElement>("[data-primary]")?.focus(); }, [step]);

  if (!live || !step) {
    return (
      <button
        type="button" data-tour-help onClick={start} aria-label="Show me around this page"
        className="tour-help fixed bottom-4 right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-[#dedad2] bg-white text-base font-semibold text-[#57524a] shadow-[0_2px_8px_rgba(40,35,25,0.12)] hover:text-[#272624] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8a5c15] print:hidden sm:bottom-6 sm:right-6"
      >
        ?
      </button>
    );
  }

  const last = i === live.length - 1;
  const next = () => (last ? close("finished") : setI(i + 1));
  const back = () => setI(Math.max(0, i - 1));
  function keys(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); close("skipped"); }
    else if (e.key === "ArrowRight") next();
    else if (e.key === "ArrowLeft") back();
    else if (e.key === "Tab") {
      // keep focus inside the card
      const f = Array.from(card.current?.querySelectorAll<HTMLElement>("button") ?? []);
      if (!f.length) return;
      const at = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && at <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && at === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  }

  // where the card goes on a wider screen: beside the target, else in the middle
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;
  let place: React.CSSProperties = { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  if (wide && rect) {
    const left = Math.min(Math.max(16, rect.left), vw - 376);
    place = rect.bottom + 230 < vh
      ? { left, top: rect.bottom + 14 }
      : { left, top: Math.max(16, rect.top - 14), transform: "translateY(-100%)" };
  }

  return createPortal(
    <div className="fixed inset-0 z-[60]" onKeyDown={keys} data-testid="tour">
      {/* the page stays visible but can't be clicked while the tour is open */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} style={rect ? undefined : { background: "rgba(28,25,20,0.45)" }} />
      {rect && (
        <div aria-hidden className="pointer-events-none absolute rounded-xl ring-2 ring-[#c9a25e] motion-safe:transition-all motion-safe:duration-300"
          style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12, boxShadow: "0 0 0 9999px rgba(28,25,20,0.45)" }} />
      )}
      <div
        ref={card} role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body"
        className={`absolute rounded-2xl bg-white p-5 shadow-[0_12px_40px_rgba(28,25,20,0.25)] ${wide ? "w-[22rem]" : "inset-x-3 bottom-3"}`}
        style={wide ? place : undefined}
      >
        <p className="text-xs tabular-nums text-[#8b857c]">{i + 1} of {live.length}</p>
        <h2 id="tour-title" className="mt-1 text-base font-semibold tracking-tight text-[#272624]">{step.title}</h2>
        <p id="tour-body" className="mt-1.5 text-sm leading-relaxed text-[#57524a]">{step.body}</p>
        <div className="mt-4 flex items-center gap-2">
          {!last && (
            <button type="button" onClick={() => close("skipped")} className="mr-auto min-h-11 px-1 text-sm text-[#74706a] underline-offset-4 hover:underline">
              Skip tour
            </button>
          )}
          {i > 0 && <button type="button" onClick={back} className={`portal-button-secondary ${last ? "mr-auto" : ""}`}>Back</button>}
          <button type="button" data-primary onClick={next} className={`portal-button ${last && i === 0 ? "ml-auto" : ""}`}>{last ? "Done" : "Next"}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
