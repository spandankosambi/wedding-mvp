"use client";

import { useEffect, useState } from "react";

/**
 * Shown when a household opens the site from their personal invitation:
 * greets them and keeps their RSVP one tap away while they look around.
 * Steps aside while the RSVP section itself is on screen, so the two
 * buttons never sit on top of each other.
 */
export function InviteBar({ familyName, href, answered }: { familyName: string; href: string; answered: boolean }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const el = document.getElementById("rsvp");
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setHidden(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      data-testid="invite-bar"
      inert={hidden}
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 transition-all duration-300"
      style={{
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        transform: hidden ? "translateY(120%)" : "none",
        opacity: hidden ? 0 : 1,
      }}
    >
      <div
        className="flex w-full max-w-md items-center justify-between gap-3 rounded-full py-2 pl-5 pr-2"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--hairline)",
          color: "var(--ink)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
        }}
      >
        <span className="min-w-0 truncate text-sm">
          Dear <strong>{familyName}</strong>
          <span className="hidden sm:inline">, you&apos;re invited</span>
        </span>
        <a
          href={href}
          className="shrink-0 rounded-full px-5 py-2.5 text-xs uppercase tracking-[0.18em] transition-opacity hover:opacity-90"
          style={{ background: "var(--accent)", color: "var(--surface)" }}
        >
          {answered ? "Your RSVP" : "RSVP"}
        </a>
      </div>
    </div>
  );
}
