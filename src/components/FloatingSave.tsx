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

const fmt = (k: string, v: FormDataEntryValue) => `${k}=${typeof v === "string" ? v : `${v.name}:${v.size}`}`;

/** What the form holds now. */
function snapshot(form: HTMLFormElement) {
  return Array.from(new FormData(form).entries()).map(([k, v]) => fmt(k, v)).join("\n");
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
    if (!name || (el as HTMLInputElement).disabled) continue;
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

export function FloatingSave({ action, batch = false, failedPart, label = "Save changes" }: Props) {
  const base = useRef(new Map<HTMLFormElement, string>());
  const [dirty, setDirty] = useState<string[]>([]);
  const [pending, start] = useTransition();

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

  // starting point: what each form holds now; then watch for edits
  useEffect(() => {
    const take = () => { for (const f of forms()) if (!base.current.has(f)) base.current.set(f, original(f)); };
    take();
    recompute();
    const onEdit = () => { take(); recompute(); };
    document.addEventListener("input", onEdit, true);
    document.addEventListener("change", onEdit, true);
    // client pieces (icon picker, add-a-row lists) change fields without typing
    const mo = new MutationObserver(onEdit);
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["value", "checked"] });
    return () => {
      document.removeEventListener("input", onEdit, true);
      document.removeEventListener("change", onEdit, true);
      mo.disconnect();
    };
  }, [recompute]);

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
    // what's being saved becomes the new starting point
    for (const f of changed) base.current.set(f, snapshot(f));
    start(async () => {
      await action(fd);
    });
    setDirty([]);
  };

  return <SaveBar count={dirty.length} pending={pending} onSave={save} label={label} />;
}

/** The floating button itself: grey while nothing has changed, coral once something has. */
export function SaveBar({ count, pending, onSave, label = "Save changes" }: {
  count: number; pending: boolean; onSave: () => void; label?: string;
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
