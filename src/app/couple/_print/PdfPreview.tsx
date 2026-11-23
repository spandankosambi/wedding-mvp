"use client";

import { useEffect, useRef, useState } from "react";

/* ── the live preview: the actual PDF, drawn by pdf.js ─────────── */
type PdfJs = typeof import("pdfjs-dist");
let pdfjsReady: Promise<PdfJs> | null = null;
function loadPdfJs(): Promise<PdfJs> {
  pdfjsReady ??= import("pdfjs-dist").then((pdfjs) => {
    if (!pdfjs.GlobalWorkerOptions.workerPort) {
      pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
    }
    return pdfjs;
  });
  return pdfjsReady;
}

export function PdfPages({ pdf }: { pdf: Blob | null }) {
  const holder = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState(0);
  useEffect(() => {
    if (!pdf || !holder.current) return;
    let cancelled = false;
    (async () => {
      const pdfjs = await loadPdfJs();
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await pdf.arrayBuffer()) }).promise;
      if (cancelled) return;
      const box = holder.current!;
      const canvases: HTMLCanvasElement[] = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const cssW = Math.min(280, box.clientWidth || 280);
        const ratio = window.devicePixelRatio || 1;
        const vp = page.getViewport({ scale: (cssW / base.width) * ratio });
        const canvas = document.createElement("canvas");
        canvas.width = vp.width;
        canvas.height = vp.height;
        canvas.style.width = `${cssW}px`;
        canvas.className = "mx-auto block rounded shadow-md ring-1 ring-black/5";
        canvas.setAttribute("aria-label", `Page ${n} of the invitation`);
        canvas.setAttribute("role", "img");
        await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
        if (cancelled) return;
        canvases.push(canvas);
      }
      box.replaceChildren(...canvases.flatMap((c, i) => {
        const cap = document.createElement("p");
        cap.className = "mb-4 mt-1.5 text-center text-[11px] text-neutral-500";
        cap.textContent = i === 0 ? "Front" : i === 1 && canvases.length > 1 ? "Page 2" : `Page ${i + 1}`;
        return [c, cap];
      }));
      setPages(doc.numPages);
      void doc.destroy();
    })().catch(() => { /* the status line reports failures */ });
    return () => { cancelled = true; };
  }, [pdf]);
  return <div ref={holder} data-testid="pdf-preview" data-pages={pages} className="space-y-0" />;
}
