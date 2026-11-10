"use client";

import { useState } from "react";

type Stay = { name: string; note: string; url?: string; common?: boolean };
type Row = Stay & { key: number };

/**
 * The family's hotels: as many as they need ("+ Add another hotel"), each
 * either common for both families or this family's own. Posts as
 * stay{i}name / note / url / common with the travel form.
 */
export function StaysEditor({ initial, family, max }: { initial: Stay[]; family: "bride" | "groom"; max: number }) {
  let next = 0;
  const [rows, setRows] = useState<Row[]>(() =>
    (initial.length ? initial : [{ name: "", note: "", url: "", common: true }]).map((s) => ({ ...s, key: next++ })),
  );
  const [counter, setCounter] = useState(rows.length);
  const own = family === "bride" ? "the bride's family's" : "the groom's family's";
  const other = family === "bride" ? "groom's" : "bride's";

  const update = (key: number, patch: Partial<Stay>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-3">
      {rows.map((s, i) => {
        const label = s.name.trim() || `Hotel ${i + 1}`;
        return (
          <div key={s.key} className="rounded-xl border border-neutral-100 p-3" data-testid="stay">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">Hotel {i + 1}</span>
                <input
                  name={`stay${i}name`} value={s.name} onChange={(e) => update(s.key, { name: e.target.value })}
                  maxLength={120} placeholder="Taj Lands End, Bandra" className="portal-input mt-1.5"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">Note</span>
                <input
                  name={`stay${i}note`} value={s.note} onChange={(e) => update(s.key, { note: e.target.value })}
                  maxLength={400} placeholder="Wedding block reserved — mention our names" className="portal-input mt-1.5"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">Booking / map link</span>
                <input
                  name={`stay${i}url`} type="url" value={s.url ?? ""} onChange={(e) => update(s.key, { url: e.target.value })}
                  maxLength={500} placeholder="https://…" className="portal-input mt-1.5"
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox" name={`stay${i}common`} checked={!!s.common}
                  onChange={(e) => update(s.key, { common: e.target.checked })}
                  aria-label={`${label} is common for both families`}
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  Common for both families
                  <span className="block text-xs text-neutral-500">
                    {s.common
                      ? `Also shown on the ${other} family's site, and they can edit it too.`
                      : `Only on ${own} site.`}
                  </span>
                </span>
              </label>
              <button
                type="button"
                onClick={() => setRows((rs) => rs.filter((r) => r.key !== s.key))}
                className="text-xs text-neutral-500 underline underline-offset-2 hover:text-red-700"
                aria-label={`Remove ${label}`}
              >
                Remove
              </button>
            </div>
          </div>
        );
      })}
      {rows.length < max ? (
        <button
          type="button"
          onClick={() => { setRows((rs) => [...rs, { name: "", note: "", url: "", common: true, key: counter }]); setCounter((c) => c + 1); }}
          className="portal-button-secondary"
        >
          + Add another hotel
        </button>
      ) : (
        <p className="text-xs text-neutral-500">That&apos;s the most a site can list ({max}).</p>
      )}
    </div>
  );
}
