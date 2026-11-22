"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IndicKeyboard } from "@/components/IndicKeyboard";
import { GROUP_LABEL, type CardField, type FieldGroup } from "@/lib/invitation/i18n-types";

/**
 * Every line of the printed cards in Gujarati or Hindi: the English beside
 * our draft, which the family can change. Saved with the page's floating
 * Save; used on the printed cards only.
 */
export function CardWordsEditor({ fields, mine, lang, family, weddingId, admin }: {
  fields: CardField[];
  mine: Record<string, string>;
  lang: "gu" | "hi";
  family: "bride" | "groom";
  weddingId: string;
  admin: boolean;
}) {
  const last = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  const [edited, setEdited] = useState<Record<string, boolean>>(() => Object.fromEntries(fields.map((f) => [f.key, mine[f.key] !== undefined])));
  const name = lang === "gu" ? "Gujarati" : "Hindi";
  // while the keyboard is docked at the bottom, the page makes room for it and Save sits above it
  const dock = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!keyboard || !dock.current) return;
    const root = document.documentElement;
    root.dataset.keyboard = "open";
    const ro = new ResizeObserver(() => root.style.setProperty("--kb-h", `${dock.current?.offsetHeight ?? 0}px`));
    ro.observe(dock.current);
    return () => { ro.disconnect(); delete root.dataset.keyboard; root.style.removeProperty("--kb-h"); };
  }, [keyboard]);
  const groups = (Object.keys(GROUP_LABEL) as FieldGroup[]).filter((g) => fields.some((f) => f.group === g));

  const track = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { last.current = e.currentTarget; };
  const onEdit = (f: CardField) => (e: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const mineNow = e.currentTarget.value.trim() !== f.auto; // read now: the event is gone by the time state updates
    setEdited((s) => (s[f.key] === mineNow ? s : { ...s, [f.key]: mineNow }));
  };
  function reset(f: CardField) {
    const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="w.${CSS.escape(f.key)}"]`);
    if (!el) return;
    el.value = f.auto;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    setEdited((s) => ({ ...s, [f.key]: false }));
  }

  return (
    <>
      <div className="sticky top-16 z-20 -mx-1 mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/95 px-3 py-2.5 ring-1 ring-neutral-200 backdrop-blur">
        <p className="text-xs text-neutral-600">
          <b className="text-neutral-800">{Object.values(edited).filter(Boolean).length}</b> of {fields.length} lines in your own words ·{" "}
          <span className="text-amber-700">{fields.filter((f) => f.check && !edited[f.key]).length} marked to check</span>
        </p>
        <button type="button" className="portal-button-secondary" onClick={() => setKeyboard((v) => !v)} aria-pressed={keyboard} data-testid="keyboard-toggle">
          {keyboard ? `Hide ${name} keyboard` : `Show ${name} keyboard`}
        </button>
      </div>

      <form data-save-part="words" onSubmit={(e) => e.preventDefault()} className="space-y-8">
        <input type="hidden" name="family" value={family} />
        <input type="hidden" name="lang" value={lang} />
        {admin && <input type="hidden" name="weddingId" value={weddingId} />}
        {groups.map((g) => (
          <section key={g} className="portal-panel p-5 md:p-6" aria-label={GROUP_LABEL[g]}>
            <h2 className="text-base font-semibold tracking-tight">{GROUP_LABEL[g]}</h2>
            <ul className="mt-4 divide-y divide-neutral-100">
              {fields.filter((f) => f.group === g).map((f) => {
                const value = mine[f.key] ?? f.auto;
                const common = {
                  name: `w.${f.key}`,
                  defaultValue: value,
                  onFocus: track,
                  onInput: onEdit(f),
                  lang,
                  "aria-label": `${f.label} in ${name}`,
                  className: "portal-input indic-script text-[15px]",
                };
                return (
                  <li key={f.key} className="grid gap-2 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:gap-5" data-testid="card-word">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-neutral-500">
                        {f.label}
                        {f.check && !edited[f.key] && <span className="ml-2 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-amber-200">check</span>}
                      </p>
                      <p className="mt-1 whitespace-pre-line text-sm text-neutral-800">{f.en}</p>
                    </div>
                    <div className="min-w-0">
                      {f.long || value.length > 60 ? <textarea rows={2} {...common} /> : <input {...common} />}
                      <p className="mt-1 h-4 text-[11px] text-neutral-400">
                        {edited[f.key]
                          ? <>Your words · <button type="button" className="underline underline-offset-2 hover:text-neutral-700" onClick={() => reset(f)}>back to our draft</button></>
                          : "Our draft"}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </form>

      {keyboard && createPortal(
        <div ref={dock} className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-2 pb-2 [&>*]:pointer-events-auto">
          <IndicKeyboard lang={lang} target={() => last.current} onClose={() => setKeyboard(false)} />
        </div>,
        document.body,
      )}
    </>
  );
}
