"use client";

import { useState } from "react";
import type { RsvpPerson } from "@/lib/contacts";

type Row = RsvpPerson & { key: number };

/**
 * Up to `max` people guests can reach about RSVPs: a name, a number, and
 * whether it's on WhatsApp (then the site opens a chat; otherwise it dials).
 * Posts as contact{i}name / phone / whatsapp with the wording form.
 */
export function ContactsEditor({ initial, max }: { initial: RsvpPerson[]; max: number }) {
  const [rows, setRows] = useState<Row[]>(() =>
    (initial.length ? initial : [{ name: "", phone: "", whatsapp: true }]).slice(0, max).map((c, i) => ({ ...c, key: i })),
  );
  const [next, setNext] = useState(rows.length);
  const update = (key: number, patch: Partial<RsvpPerson>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-3" data-testid="rsvp-contacts-editor">
      {rows.map((c, i) => {
        const who = c.name.trim() || `Contact ${i + 1}`;
        return (
          <div key={c.key} className="rounded-xl border border-neutral-100 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">Contact {i + 1} name</span>
                <input
                  name={`contact${i}name`} value={c.name} onChange={(e) => update(c.key, { name: e.target.value })}
                  maxLength={60} placeholder="Vikram Mehta" className="portal-input mt-1.5"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">Contact {i + 1} number</span>
                <input
                  name={`contact${i}phone`} type="tel" inputMode="tel" value={c.phone} onChange={(e) => update(c.key, { phone: e.target.value })}
                  maxLength={30} placeholder="+91 98200 11111" className="portal-input mt-1.5"
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox" name={`contact${i}whatsapp`} checked={c.whatsapp}
                  onChange={(e) => update(c.key, { whatsapp: e.target.checked })}
                  aria-label={`${who}'s number is on WhatsApp`} className="mt-0.5 h-4 w-4"
                />
                <span>
                  On WhatsApp
                  <span className="block text-xs text-neutral-500">
                    {c.whatsapp ? "Guests tapping the number open a WhatsApp chat." : "Guests tapping the number get a call."}
                  </span>
                </span>
              </label>
              {(rows.length > 1 || c.name || c.phone) && (
                <button
                  type="button"
                  onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== c.key) : [{ name: "", phone: "", whatsapp: true, key: next }]))}
                  className="text-xs text-neutral-500 underline underline-offset-2 hover:text-red-700"
                  aria-label={`Remove ${who}`}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        );
      })}
      {rows.length < max && (
        <button
          type="button"
          onClick={() => { setRows((rs) => [...rs, { name: "", phone: "", whatsapp: true, key: next }]); setNext((n) => n + 1); }}
          className="portal-button-secondary"
        >
          + Add another contact
        </button>
      )}
    </div>
  );
}
