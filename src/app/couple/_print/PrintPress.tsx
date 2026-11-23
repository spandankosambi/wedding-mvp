"use client";

import { useEffect } from "react";

/* ── Download PDF: the printing press ─────────────────────────── */

/**
 * For twenty seconds after Download PDF, the page blurs and a little press
 * prints the card the family designed (the preview's first page), then says
 * what paper each file goes on. A click closes it sooner.
 */
export function PrintPress({ image, steps, onClose }: { image: string | null; steps: string[]; onClose: () => void }) {
  useEffect(() => {
    const id = setTimeout(onClose, 20_000);
    return () => clearTimeout(id);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label="Your PDFs are downloading" data-testid="print-press" onClick={onClose}
      className="press-overlay fixed inset-0 z-[60] flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-md">
      <div className="w-full max-w-sm text-center">
        {/* the press: housing, rollers, and the sheet coming out */}
        <div className="relative mx-auto w-64">
          <div className="relative z-10 rounded-t-2xl bg-gradient-to-b from-stone-700 to-stone-900 px-4 pb-3 pt-3 shadow-xl">
            <p className="font-serif text-[10px] uppercase tracking-[0.35em] text-amber-200/90">One Tap Press</p>
            <div className="mt-2 flex justify-center gap-1">
              <span className="press-roller block h-5 w-24 rounded-full shadow-inner" />
              <span className="press-roller block h-5 w-24 rounded-full shadow-inner" />
            </div>
          </div>
          <div className="relative z-10 mx-auto h-2 w-56 rounded-b bg-stone-950" />
          <div className="relative mx-auto -mt-0.5 w-48 overflow-hidden">
            <div className="press-sheet relative">
              {image
                ? <img src={image} alt="Your card" className="block w-full rounded-b-sm shadow-2xl ring-1 ring-black/10" />
                : <div className="aspect-[5/7] w-full rounded-b-sm bg-amber-50 shadow-2xl" />}
              <span className="press-ink pointer-events-none absolute inset-x-0 top-0 h-full bg-gradient-to-b from-white/70 via-white/10 to-transparent" />
            </div>
          </div>
        </div>
        {/* then: what to print it on */}
        <div className="press-done mx-auto mt-5 rounded-2xl bg-white px-5 py-4 text-left shadow-2xl ring-1 ring-black/5" data-testid="press-paper">
          <p className="font-medium text-stone-900">Your PDFs are downloading</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-stone-700">
            {steps.map((s) => <li key={s}>{s}</li>)}
          </ul>
          <p className="mt-2 text-xs text-stone-400">This stays next to Download PDF. Click anywhere to close.</p>
        </div>
      </div>
    </div>
  );
}

/** The print page: the questions, the design, a live preview, the PDF. */
