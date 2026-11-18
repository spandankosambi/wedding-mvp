"use client";

import { useEffect, useRef, useState } from "react";
import { JumpIcon } from "./JumpIcon";

/**
 * The parts of the long site editor. On a laptop it is a list in the left
 * margin that stays in view; on a phone, a "Jump to" menu under the bar.
 * The section you're reading is lit up, as you scroll.
 */
export function JumpNav({ items }: { items: [string, string][] }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const [here, setHere] = useState<string | null>(null);
  const idList = items.map(([id]) => id).join(",");

  useEffect(() => {
    const ids = idList.split(",");
    let raf = 0;
    const look = () => {
      raf = 0;
      // the last section whose top has passed a line a little below the bar
      const line = 140;
      let current: string | null = null;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      // at the very bottom, the last section counts even if its top is lower
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        for (let i = ids.length - 1; i >= 0; i--) if (document.getElementById(ids[i])) { current = ids[i]; break; }
      }
      setHere(current ?? ids.find((id) => document.getElementById(id)) ?? null);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(look); };
    look();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("hashchange", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("hashchange", onScroll);
    };
  }, [idList]);

  const link = (id: string, label: string, onClick?: () => void) => (
    <a key={id} href={`#${id}`} onClick={onClick} aria-current={here === id ? "location" : undefined}>
      <JumpIcon id={id} />{label}
    </a>
  );
  return (
    <>
      <nav aria-label="Jump to" className="portal-jump">
        <p className="portal-jump-label">On this page</p>
        {items.map(([id, label]) => link(id, label))}
      </nav>
      <details ref={menu} className="portal-jump-menu">
        <summary>Jump to a section</summary>
        <nav aria-label="Jump to">
          {items.map(([id, label]) => link(id, label, () => { if (menu.current) menu.current.open = false; }))}
        </nav>
      </details>
    </>
  );
}
