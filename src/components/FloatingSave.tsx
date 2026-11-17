"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

/*
 * One Save for a whole page, floating at the bottom of the screen.
 *
 * It watches every <form data-save-part="…"> on the page: greyed out while
 * nothing has changed, coral once something has. Pressing it saves every
 * changed form — through one combined action when the page has several
 * sections (`batch`), or the single form's own action otherwise.
 *
 * Remount it (key it on the URL's query) after a save so it takes the saved
 * values as its new starting point.
 */

type Props = {
  /** the page's save action */
  action: (fd: FormData) => void | Promise<void>;
  /** true: one call carrying every changed form, fields prefixed "0.", "1."… */
  batch?: boolean;
  /** a section that just failed to save: counts as changed until it's saved */
  failedPart?: string;
  label?: string;
};

/* fields shared by every form on the page, sent once rather than per section */
const SHARED = new Set(["weddingId", "family"]);

const forms = () => Array.from(document.querySelectorAll<HTMLFormElement>("form[data-save-part]"));

/* Line breaks in a text box are read back from the form as "\r\n" but held
   in the page as "\n", so both are written the same way before comparing. */
const fmt = (k: string, v: FormDataEntryValue) => `${k}=${typeof v === "string" ? v.replace(/\r\n?/g, "\n") : `${v.name}:${v.size}`}`;

/* React adds a hidden "$ACTION_…" field to forms that comes and goes; it's
   not something anyone edits */
const ours = (name: string) => !name.startsWith("$ACTION");

/** What the form holds now. */
function snapshot(form: HTMLFormElement) {
  return Array.from(new FormData(form).entries()).filter(([k]) => ours(k)).map(([k, v]) => fmt(k, v)).join("\n");
}

/**
 * What the form held when the page arrived, in the same shape as snapshot().
 * Read from the fields' defaults rather than their current values, so a click
 * made before the page finished loading still counts as a change.
 */
function original(form: HTMLFormElement) {
  const out: string[] = [];
  for (const el of Array.from(form.elements)) {
    const name = (el as HTMLInputElement).name;
    if (!name || !ours(name) || (el as HTMLInputElement).disabled) continue;
    if (el instanceof HTMLInputElement) {
      if (el.type === "file" || el.type === "submit" || el.type === "button" || el.type === "reset" || el.type === "image") continue;
      if (el.type === "checkbox" || el.type === "radio") { if (el.defaultChecked) out.push(fmt(name, el.value)); continue; }
      out.push(fmt(name, el.defaultValue));
    } else if (el instanceof HTMLTextAreaElement) {
      out.push(fmt(name, el.defaultValue));
    } else if (el instanceof HTMLSelectElement) {
      const opts = Array.from(el.options);
      const picked = opts.filter((o) => o.defaultSelected);
      const chosen = picked.length ? (el.multiple ? picked : [picked[picked.length - 1]]) : (el.multiple || !opts.length ? [] : [opts[0]]);
      for (const o of chosen) out.push(fmt(name, o.value));
    }
  }
  return out.join("\n");
}

/* The sections just saved, carried over the reload that follows a save.
   Their new starting point is what they show once the page has settled: the
   server may tidy a value (a hashtag loses its "#"), and fields the page
   manages itself (tick-boxes in the event editor) keep their first-load
   defaults, so neither what was sent nor the defaults can be trusted. */
let justSaved: Set<string> | null = null;

export function FloatingSave({ action, batch = false, failedPart, label = "Save changes" }: Props) {
  const base = useRef(new Map<HTMLFormElement, string>());
  const [dirty, setDirty] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [pending, start] = useTransition();
  const saving = useRef<Set<string> | null>(null);

  const recompute = useCallback(() => {
    const changed = forms()
      .filter((f) => {
        const was = base.current.get(f);
        return was !== undefined && was !== snapshot(f);
      })
      .map((f) => f.dataset.savePart!);
    // a section that just failed stays marked until it's saved
    if (failedPart && !changed.includes(failedPart) && forms().some((f) => f.dataset.savePart === failedPart)) changed.unshift(failedPart);
    setDirty((prev) => (prev.join() === changed.join() ? prev : changed));
  }, [failedPart]);

  // starting point: what each form held when the page arrived (or, for the
  // sections just saved, exactly what was saved); then watch for edits
  useEffect(() => {
    const saved = justSaved;
    justSaved = null;
    saved?.delete(failedPart ?? "");
    const take = () => {
      for (const f of forms()) {
        if (base.current.has(f)) continue;
        base.current.set(f, saved?.has(f.dataset.savePart!) ? snapshot(f) : original(f));
      }
    };
    take();
    recompute();
    setReady(true);
    const timers = saved?.size ? settle(saved) : [];
    const onEdit = () => { take(); recompute(); };
    document.addEventListener("input", onEdit, true);
    document.addEventListener("change", onEdit, true);
    // client pieces (icon picker, add-a-row lists) change fields without typing
    const mo = new MutationObserver(onEdit);
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["value", "checked"] });
    return () => {
      timers.forEach(clearTimeout);
      document.removeEventListener("input", onEdit, true);
      document.removeEventListener("change", onEdit, true);
      mo.disconnect();
    };
  }, [recompute, failedPart]); // eslint-disable-line react-hooks/exhaustive-deps

  /* the sections just saved start again from what they show once the save's
     reload has settled (looked at a few times, as the page redraws) */
  function settle(parts: Set<string>) {
    return [0, 300, 1000].map((ms) => setTimeout(() => {
      for (const f of forms()) if (parts.has(f.dataset.savePart!)) base.current.set(f, snapshot(f));
      recompute();
    }, ms));
  }

  // a save that came back to the same address (no fresh start): settle here
  useEffect(() => {
    if (pending || !saving.current) return;
    const parts = saving.current;
    saving.current = null;
    justSaved = null;
    const timers = settle(parts);
    return () => timers.forEach(clearTimeout);
  }, [pending]); // eslint-disable-line react-hooks/exhaustive-deps

  // leaving with unsaved changes asks first
  useEffect(() => {
    if (!dirty.length) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty.length]);

  const save = () => {
    const changed = forms().filter((f) => dirty.includes(f.dataset.savePart!));
    if (!changed.length) return;
    // the browser's own checks (required fields, dates, links) first
    for (const f of changed) {
      if (!f.checkValidity()) {
        f.closest("details")?.setAttribute("open", "");
        f.reportValidity();
        return;
      }
    }
    let fd: FormData;
    if (batch) {
      fd = new FormData();
      const parts: string[] = [];
      changed.forEach((f, i) => {
        parts.push(f.dataset.savePart!);
        for (const [k, v] of new FormData(f).entries()) {
          if (SHARED.has(k)) { if (!fd.has(k)) fd.set(k, v); }
          else fd.append(`${i}.${k}`, v);
        }
      });
      fd.set("__parts", parts.join(","));
    } else {
      fd = new FormData(changed[0]);
    }
    // what's being saved becomes the new starting point, here and after the reload
    const parts = new Set(changed.map((f) => f.dataset.savePart!));
    justSaved = parts;
    saving.current = parts;
    for (const f of changed) base.current.set(f, snapshot(f));
    start(async () => {
      await action(fd);
    });
    setDirty([]);
  };

  return <SaveBar count={dirty.length} pending={pending} onSave={save} label={label} ready={ready} />;
}

/** The floating button itself: grey while nothing has changed, coral once something has. */
export function SaveBar({ count, pending, onSave, label = "Save changes", ready = true }: {
  count: number; pending: boolean; onSave: () => void; label?: string; ready?: boolean;
}) {
  const active = count > 0 && !pending;
  const text = pending ? "Saving…" : count > 1 ? `${label} (${count})` : count ? label : "All changes saved";
  return (
    <div className="floating-save pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 sm:bottom-6">
      <button
        type="button"
        onClick={onSave}
        disabled={!active}
        aria-live="polite"
        data-testid="floating-save"
        data-dirty={count ? "true" : "false"}
        data-ready={ready ? "true" : "false"}
        className={
          "pointer-events-auto rounded-full px-6 py-3 text-sm font-semibold shadow-lg transition-colors duration-200 " +
          (active
            ? "bg-[#E2553B] text-white ring-4 ring-[#E2553B]/20 hover:bg-[#c9452d]"
            : "cursor-default bg-neutral-200 text-neutral-500 shadow-sm")
        }
      >
        {text}
      </button>
    </div>
  );
}
