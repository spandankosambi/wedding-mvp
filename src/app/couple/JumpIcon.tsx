/*
 * A small line icon for each "On this page" item, picked by the section's id,
 * so the list can be scanned at a glance. Drawn on a 24-unit grid in the
 * current text colour; an id without its own icon gets a small dot.
 */
const P: Record<string, string> = {
  // the site editor
  theme: "M12 3a9 9 0 1 0 0 18c1 0 1.6-.8 1.6-1.6 0-.5-.2-.8-.5-1.1-.3-.3-.5-.7-.5-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4-4-7.6-9-7.6Z M7.5 11.5h.01 M10 7.5h.01 M14.5 7.5h.01",
  decor: "M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9Z M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z",
  wording: "M7 4h10a2 2 0 0 1 2 2v13l-3-2-3 2-3-2-3 2V6a2 2 0 0 1 2-2Z M9 9h6 M9 12.5h4",
  words: "M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z",
  events: "M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z M4 10h16 M8 3.5v4 M16 3.5v4",
  travel: "M3 18V7 M3 14h18v4 M21 14v-2a3 3 0 0 0-3-3h-7v5 M7 11.5h.01",
  gallery: "M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z M4 16l5-5 4 4 2-2 5 5 M15.5 8.5h.01",
  know: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 11v5 M12 7.5h.01",
  music: "M9 18V5l11-2v13 M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z M20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  // dashboard and sections
  numbers: "M4 20h16 M7 16v-5 M12 16V7 M17 16v-8",
  families: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M2.5 20a6.5 6.5 0 0 1 13 0 M16 4.5a3.5 3.5 0 0 1 0 6.5 M18 14.5a6.5 6.5 0 0 1 3.5 5.5",
  details: "M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z M8 9h8 M8 12.5h8 M8 16h5",
  people: "M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M3.5 20a6.5 6.5 0 0 1 11.5-4.2 M15 20l1.8-1.8m0 0a2.3 2.3 0 1 0 3.2-3.2 2.3 2.3 0 0 0-3.2 3.2Z",
  share: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  rsvp: "M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z M8 12l3 3 5-6",
  reset: "M4 4v5h5 M4.6 15a8 8 0 1 0 1.9-8.3L4 9",
  replies: "M4 13h4l1.5 2.5h5L16 13h4 M5.5 5h13L21 13v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5Z",
  list: "M9 6h11 M9 12h11 M9 18h11 M4.5 6h.01 M4.5 12h.01 M4.5 18h.01",
  "print-options": "M4 6h10 M18 6h2 M4 12h4 M12 12h8 M4 18h12 M20 18h0 M16 4v4 M10 10v4 M18 16v4",
  "print-preview": "M7 9V4h10v5 M7 17H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2 M7 14h10v6H7Z",
  // people & access
  add: "M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M3.5 20a6.5 6.5 0 0 1 11-4.7 M19 14v6 M16 17h6",
  levels: "M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6Z M9 12l2 2 4-4",
};

export function JumpIcon({ id }: { id: string }) {
  const d = P[id];
  return (
    <svg className="portal-jump-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {d ? <path d={d} /> : <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />}
    </svg>
  );
}
