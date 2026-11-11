"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GalleryPhoto } from "@/db/schema";
import { justify } from "@/lib/justify";

// keep in step with .photo-rows in globals.css (the pre-measure fallback)
const DESKTOP = { targetHeight: 260, gap: 14, mat: 12 };
const PHONE = { targetHeight: 170, gap: 8, mat: 8 };

/**
 * The couple's photos, in the order they set, laid out in justified rows:
 * each row is one height and fills the width, so portraits and landscapes sit
 * side by side with no holes and the order reads left to right. Tapping a
 * photo opens a full-screen viewer with previous/next, arrow keys and swipe.
 */
export function PhotoGallery({ photos }: { photos: GalleryPhoto[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const closeBtn = useRef<HTMLButtonElement | null>(null);
  const touchX = useRef<number | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const n = photos.length;

  // Plan rows against the real width. Until it's measured (server render,
  // first paint) the CSS flex fallback in globals.css lays the tiles out.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const opts = width > 0 && width < 600 ? PHONE : DESKTOP;
  // photo height per index once planned; null = use the CSS fallback
  const sizes = useMemo(() => {
    if (width <= 0) return null;
    const rows = justify(photos.map((p) => p.width / p.height), width - 1, opts);
    const h: number[] = [];
    for (const row of rows) for (const i of row.items) h[i] = row.height;
    return h;
  }, [photos, width, opts]);

  const close = useCallback(() => {
    setOpen(null);
    opener.current?.focus();
  }, []);
  const step = useCallback((d: number) => setOpen((i) => (i === null ? i : (i + d + n) % n)), [n]);

  useEffect(() => {
    if (open === null) return;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    // warm the neighbours so next/previous is instant
    for (const d of [1, -1]) { const img = new Image(); img.src = photos[(open + d + n) % n].url; }
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, n, photos, close, step]);

  const current = open === null ? null : photos[open];

  return (
    <>
      {/* One flat list in both modes, so the tiles are the same elements before
          and after the rows are planned (ScrollFx's fade-in state survives).
          Planned widths sum to the width, so each row wraps exactly where
          justify() ended it. */}
      <div ref={box} className={sizes ? "photo-rows is-planned" : "photo-rows"} style={sizes ? { gap: opts.gap } : undefined} data-testid="photo-rows">
        {photos.map((p, i) => {
          const r = p.width / p.height;
          const h = sizes?.[i];
          return (
            <button
              key={p.pathname}
              type="button"
              className="reveal plate photo-tile"
              data-fx="scale"
              style={{
                "--rd": `${(i % 4) * 0.08}s`,
                ...(h
                  ? { flex: "0 0 auto", width: `${r * h + opts.mat}px`, padding: `${opts.mat / 2}px` }
                  : { flexGrow: r, flexBasis: `calc(${r} * var(--row-h) + var(--mat))` }),
              } as unknown as React.CSSProperties}
              onClick={(e) => { opener.current = e.currentTarget; setOpen(i); }}
              aria-label={`Open photo ${i + 1} of ${n}`}
            >
              <img
                src={p.url}
                alt=""
                width={p.width}
                height={p.height}
                loading="lazy"
                style={h ? { height: `${h}px` } : { aspectRatio: `${p.width} / ${p.height}` }}
              />
            </button>
          );
        })}
      </div>

      {current && open !== null && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Photo ${open + 1} of ${n}`}
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
          onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            if (touchX.current === null) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            touchX.current = null;
            if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
          }}
        >
          <img key={current.pathname} src={current.url} alt="" className="lightbox-img" width={current.width} height={current.height} />
          <button ref={closeBtn} type="button" className="lightbox-btn lightbox-close" onClick={close} aria-label="Close">×</button>
          {n > 1 && (
            <>
              <button type="button" className="lightbox-btn lightbox-prev" onClick={() => step(-1)} aria-label="Previous photo">‹</button>
              <button type="button" className="lightbox-btn lightbox-next" onClick={() => step(1)} aria-label="Next photo">›</button>
            </>
          )}
          <p className="lightbox-count" aria-live="polite">{open + 1} / {n}</p>
        </div>
      )}
    </>
  );
}
