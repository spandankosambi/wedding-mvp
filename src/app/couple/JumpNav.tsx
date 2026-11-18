"use client";

import { useRef } from "react";
import { JumpIcon } from "./JumpIcon";

/**
 * The parts of the long site editor. On a laptop it is a list in the left
 * margin that stays in view; on a phone, a "Jump to" menu under the bar.
 */
export function JumpNav({ items }: { items: [string, string][] }) {
  const menu = useRef<HTMLDetailsElement>(null);
  return (
    <>
      <nav aria-label="Jump to" className="portal-jump">
        <p className="portal-jump-label">On this page</p>
        {items.map(([id, label]) => <a key={id} href={`#${id}`}><JumpIcon id={id} />{label}</a>)}
      </nav>
      <details ref={menu} className="portal-jump-menu">
        <summary>Jump to a section</summary>
        <nav aria-label="Jump to">
          {items.map(([id, label]) => (
            <a key={id} href={`#${id}`} onClick={() => { if (menu.current) menu.current.open = false; }}><JumpIcon id={id} />{label}</a>
          ))}
        </nav>
      </details>
    </>
  );
}
