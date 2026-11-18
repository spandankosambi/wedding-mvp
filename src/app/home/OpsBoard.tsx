"use client";

import { useEffect, useRef, useState } from "react";

/* The family's side of the product, as it actually looks: the guest list's
   Families view (RSVP per celebration, rooms, what was sent), with replies
   landing while you watch. Scripted, not random, so
   the numbers it ends on are the numbers in the copy beside it. It runs once,
   only when on screen. */

type Row = {
  family: string; heads: number; sangeet: number; pheras: number; reception: number; veg: boolean; replied: boolean;
  /** shown Travel & Stay, and their room if they have one */
  stay: string | null;
  sent: string;
};

const START: Row[] = [
  { family: "The Mehras", heads: 4, sangeet: 4, pheras: 4, reception: 4, veg: true, replied: true, stay: "Taj · 204", sent: "✓ WhatsApp 12 Nov" },
  { family: "Kapoor parivar", heads: 6, sangeet: 6, pheras: 2, reception: 6, veg: false, replied: true, stay: "Taj · 206", sent: "✓ Emailed 12 Nov" },
  { family: "Dr. Iyer & family", heads: 3, sangeet: 0, pheras: 3, reception: 3, veg: true, replied: true, stay: null, sent: "✓ WhatsApp 13 Nov" },
  { family: "Sameer & Tanvi", heads: 2, sangeet: 2, pheras: 2, reception: 2, veg: false, replied: false, stay: "Leela · 11", sent: "✓ Emailed 14 Nov" },
  { family: "Nani ji's side", heads: 9, sangeet: 9, pheras: 9, reception: 9, veg: true, replied: false, stay: "Taj · 301", sent: "✓ WhatsApp 14 Nov" },
  { family: "The Bhatias", heads: 5, sangeet: 5, pheras: 0, reception: 5, veg: false, replied: false, stay: null, sent: "✓ WhatsApp 15 Nov" },
  { family: "Ananya's office", heads: 7, sangeet: 7, pheras: 0, reception: 7, veg: false, replied: false, stay: null, sent: "✓ Emailed 15 Nov" },
  { family: "Chachu & Chachi", heads: 3, sangeet: 3, pheras: 3, reception: 3, veg: true, replied: false, stay: "Leela · 12", sent: "✓ WhatsApp 16 Nov" },
];

const RITES = [["Sangeet", "sangeet"], ["Pheras", "pheras"], ["Reception", "reception"]] as const;

const ORDER = [4, 3, 6, 7, 5]; // the order replies land, for pacing

export function OpsBoard() {
  const [rows, setRows] = useState<Row[]>(START);
  const [flash, setFlash] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || started.current) return;
      started.current = true;
      io.disconnect();
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      ORDER.forEach((idx, k) => {
        setTimeout(() => {
          setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, replied: true } : r)));
          if (!reduced) {
            setFlash(idx);
            setTimeout(() => setFlash((f) => (f === idx ? null : f)), 900);
          }
        }, reduced ? 0 : 1200 + k * 1500);
      });
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const replied = rows.filter((r) => r.replied);
  const sum = (k: "sangeet" | "pheras" | "reception" | "heads") => replied.reduce((n, r) => n + r[k], 0);
  const veg = replied.filter((r) => r.veg).reduce((n, r) => n + r.heads, 0);
  const pending = rows.length - replied.length;

  return (
    <div ref={ref} className="portal-panel board">
      <div className="board-head">
        <div>
          <p className="portal-eyebrow">Ananya weds Arjun · Guest list</p>
          <p className="board-title">{rows.length} families · {pending ? `${pending} still to answer` : "everyone has answered"}</p>
        </div>
        <span className="portal-badge">{pending ? "Replies arriving" : "Up to date"}</span>
      </div>

      <div className="board-stats">
        <Stat label="Sangeet" value={sum("sangeet")} />
        <Stat label="Pheras" value={sum("pheras")} />
        <Stat label="Reception" value={sum("reception")} />
        <Stat label="Veg plates" value={veg} />
      </div>

      <div className="board-tabs" aria-hidden>
        <span data-on="true">Families · {rows.length}</span>
        <span>Guests · {rows.reduce((n, r) => n + r.heads, 0)}</span>
        <span>Hotels &amp; rooms</span>
      </div>

      <div className="board-scroll">
      <table className="portal-table w-full text-sm">
        <thead>
          <tr>
            <th className="text-left">Family</th>
            <th className="text-left">RSVP</th>
            <th className="text-left">Stay</th>
            <th className="text-left">Sent</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.family} data-flash={flash === i}>
              <td>
                <p className="font-medium">{r.family}</p>
                <p className="text-xs" style={{ color: "#8a857d" }}>{r.heads} guests</p>
              </td>
              <td>
                <span className="board-chips">
                  {RITES.map(([label, k]) => {
                    const n = r[k];
                    const state = !r.replied ? "wait" : n ? "yes" : "no";
                    return (
                      <span key={k} className="board-chip" data-state={state}>
                        {label} {state === "wait" ? "—" : state === "yes" ? `✓${n}` : "✗"}
                      </span>
                    );
                  })}
                </span>
              </td>
              <td className="text-xs whitespace-nowrap" style={{ color: r.stay ? "#272624" : "#b5b0a8" }}>{r.stay ?? "—"}</td>
              <td className="text-xs whitespace-nowrap" style={{ color: r.sent.includes("WhatsApp") ? "#128c7e" : "#047857" }}>{r.sent}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="board-stat">
      <span className="portal-stat-label">{label}</span>
      <span className="board-stat-value tabular-nums">{value}</span>
    </div>
  );
}
