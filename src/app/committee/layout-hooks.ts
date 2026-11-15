"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * The guest list's button bar stays under the top bar while the rows scroll,
 * and the column titles stay under it. The bar's height varies (its buttons
 * wrap), so it is measured and handed to the stylesheet as --bar-h.
 */
export function useBarHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    const set = () => host.style.setProperty("--bar-h", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return ref;
}

const PHONE = "(max-width: 767px)";
function subscribe(cb: () => void) {
  const m = window.matchMedia(PHONE);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}

/** True on a phone-sized screen (the server and first paint assume a laptop). */
export function useIsPhone() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(PHONE).matches, () => false);
}
