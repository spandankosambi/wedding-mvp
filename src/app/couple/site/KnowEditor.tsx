"use client";

import { useState } from "react";

type Item = { title: string; text: string };
type Row = Item & { key: number };

/**
 * "Things to know": up to `max` short notes for guests (parking, weather,
 * what to wear…). Posts as know{i}title / know{i}text with its form.
 */
export function KnowEditor({ initial, max, suggestions }: { initial: Item[]; max: number; suggestions: readonly string[] }) {
  const [rows, setRows] = useState<Row[]>(() => (initial.length ? initial : [{ title: "", text: "" }]).slice(0, max).map((r, i) => ({ ...r, key: i })));
  const [next, setNext] = useState(rows.length);
  const update = (key: number, patch: Partial<Item>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const add = (title = "") => {
    setRows((rs) => {
      const blank = rs.find((r) => !r.title && !r.text);
      if (blank && title) return rs.map((r) => (r.key === blank.key ? { ...r, title } : r));
      return rs.length < max ? [...rs, { title, text: "", key: next }] : rs;
    });
    setNext((n) => n + 1);
  };
  const unused = suggestions.filter((s) => !rows.some((r) => r.title.trim().toLowerCase() === s.toLowerCase()));

  return (
    <div className="space-y-3" data-testid="know-editor">
      {rows.map((r, i) => (
        <div key={r.key} className="grid gap-3 rounded-xl border border-neutral-100 p-3 md:grid-cols-[14rem_minmax(0,1fr)_auto]">
          <label className="block">
            <span className="text-xs font-medium text-neutral-600">Note {i + 1}</span>
            <input name={`know${i}title`} value={r.title} onChange={(e) => update(r.key, { title: e.target.value })} maxLength={40} placeholder="Parking" className="portal-input mt-1.5" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-neutral-600">What guests should know</span>
            <input name={`know${i}text`} value={r.text} onChange={(e) => update(r.key, { text: e.target.value })} maxLength={280} placeholder="Valet at the main gate; self-parking behind the lawn." className="portal-input mt-1.5" aria-label={`What guests should know about ${r.title || `note ${i + 1}`}`} />
          </label>
          <button type="button" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [{ title: "", text: "", key: r.key }]))}
            className="self-end pb-2 text-xs text-neutral-500 underline underline-offset-2 hover:text-red-700" aria-label={`Remove ${r.title || `note ${i + 1}`}`}>
            Remove
          </button>
        </div>
      ))}
      {rows.length < max && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => add()} className="portal-button-secondary">+ Add a note</button>
          {unused.slice(0, 5).map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-600 hover:border-neutral-400">+ {s}</button>
          ))}
        </div>
      )}
    </div>
  );
}
