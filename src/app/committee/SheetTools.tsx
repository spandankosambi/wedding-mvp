"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sheetUpdateAction, type SheetUpdateResult } from "./sheet-actions";
import type { SheetPlan } from "@/lib/guest-sheet";

/**
 * Download the guest list (Excel or CSV) as it stands, edit it anywhere, and
 * upload it again: you see every change first, then apply only those.
 */
export function SheetTools({ weddingId, admin, family, canEdit }: { weddingId: string; admin: boolean; family: "bride" | "groom"; canEdit: boolean }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [plan, setPlan] = useState<SheetPlan | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const q = new URLSearchParams({ family, ...(admin ? { wedding: weddingId } : {}) });

  const open = () => { setFile(null); setPlan(null); setDone(null); setError(null); dialog.current?.showModal(); };
  const close = () => dialog.current?.close();

  function send(apply: boolean) {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("family", family);
    if (admin) fd.set("weddingId", weddingId);
    if (apply) fd.set("apply", "1");
    start(async () => {
      setError(null);
      const r: SheetUpdateResult = await sheetUpdateAction(fd);
      if (!r.ok) { setError(r.error); return; }
      if (!("plan" in r)) return;
      setPlan(r.plan);
      if (r.applied) { setDone(r.plan.count); router.refresh(); }
    });
  }

  return (
    <>
      <details className="sheet-menu relative">
        <summary className="portal-button-secondary cursor-pointer list-none">Download list ▾</summary>
        <div className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-neutral-200 bg-white p-1 text-sm shadow-lg">
          <a href={`/committee/export?${q}&format=xlsx`} className="block rounded-lg px-3 py-2 hover:bg-neutral-50" download>Excel (.xlsx)</a>
          <a href={`/committee/export?${q}&format=csv`} className="block rounded-lg px-3 py-2 hover:bg-neutral-50" download>CSV (.csv)</a>
        </div>
      </details>
      {canEdit && <button type="button" onClick={open} className="portal-button-secondary">Update from spreadsheet</button>}

      <dialog ref={dialog} className="portal-help-dialog" style={{ width: "min(40rem, calc(100vw - 2rem))" }} aria-labelledby="sheet-title"
        onClick={(e) => { if (e.target === dialog.current) close(); }}>
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="portal-eyebrow">Guest list</p>
              <h2 id="sheet-title" className="mt-1 text-lg font-semibold">Update from spreadsheet</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Upload the list you downloaded, after editing it. Only what you changed is applied; nobody is added twice, and nobody is removed.
              </p>
            </div>
            <button type="button" onClick={close} className="portal-icon-button rounded-lg" aria-label="Close">×</button>
          </div>

          {done !== null ? (
            <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
              Saved {done} change{done === 1 ? "" : "s"} to the guest list.
              <div className="mt-3"><button type="button" onClick={close} className="portal-button">Done</button></div>
            </div>
          ) : (
            <>
              <label className="mt-5 block">
                <span className="text-xs font-medium text-neutral-600">Your edited file (.xlsx or .csv)</span>
                <input type="file" accept=".xlsx,.xls,.csv" className="portal-input mt-1.5" aria-label="Spreadsheet to upload"
                  onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPlan(null); setError(null); }} />
              </label>
              {error && <p className="mt-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-900" role="alert">{error}</p>}

              {plan && <SheetPlanView plan={plan} />}

              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={close} className="portal-button-secondary">Cancel</button>
                {plan && plan.count > 0 && !plan.errors.length
                  ? <button type="button" disabled={pending} onClick={() => send(true)} className="portal-button">{pending ? "Saving…" : `Apply ${plan.count} change${plan.count === 1 ? "" : "s"}`}</button>
                  : <button type="button" disabled={pending || !file} onClick={() => send(false)} className="portal-button">{pending ? "Checking…" : "Check changes"}</button>}
              </div>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}

const GROUPS: [string, SheetPlan["changes"][number]["kind"]][] = [["New households", "new-household"], ["New guests", "new-guest"], ["Changes", "update"], ["Not added (already on the list)", "skip"]];

/** What an uploaded sheet would change, grouped; shown before anything is saved. */
export function SheetPlanView({ plan }: { plan: SheetPlan }) {
  return (
    <div className="mt-5 max-h-[45vh] overflow-y-auto rounded-xl border border-neutral-200 p-4 text-sm" data-testid="sheet-plan">
      {plan.errors.length > 0 && (
        <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-red-900" role="alert">
          <p className="font-medium">Fix these rows first, then upload again:</p>
          <ul className="mt-1 list-disc pl-5">{plan.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}
      {plan.count === 0 && !plan.errors.length && <p className="text-neutral-600">Nothing to update — the file matches the list.</p>}
      {GROUPS.map(([title, kind]) => {
        const items = plan.changes.filter((c) => c.kind === kind);
        if (!items.length) return null;
        return (
          <div key={kind} className="mb-3">
            <p className="font-medium">{title} · {items.length}</p>
            <ul className="mt-1 space-y-0.5 text-neutral-600">{items.map((c, i) => <li key={i}>{c.text}</li>)}</ul>
          </div>
        );
      })}
      <p className="text-xs text-neutral-400">{plan.unchanged} guest{plan.unchanged === 1 ? "" : "s"} unchanged.</p>
    </div>
  );
}
