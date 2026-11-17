"use client";
import { useEffect } from "react";

/*
 * Makes the couple's photos hard to save or copy from a guest page: no
 * right-click / long-press menu (so no "Save image" or "Copy image address")
 * and no dragging a photo out to the desktop. This stops casual copying only —
 * anything a browser can show, a determined person can still capture.
 */
export function ImageGuard() {
  useEffect(() => {
    const isPhoto = (t: EventTarget | null) =>
      t instanceof Element && !!t.closest("img, picture, .photo-tile, .lightbox, [data-protect]");
    const block = (e: Event) => { if (isPhoto(e.target)) e.preventDefault(); };
    document.addEventListener("contextmenu", block, true);
    document.addEventListener("dragstart", block, true);
    return () => {
      document.removeEventListener("contextmenu", block, true);
      document.removeEventListener("dragstart", block, true);
    };
  }, []);
  return null;
}
