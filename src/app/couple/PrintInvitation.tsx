"use client";

import { useEffect, useMemo, useState } from "react";
import { eventForSide, type Side } from "@/lib/sides";
import {
  BLEED_MM, CARD_SIZES, CUSTOM_MAX_MM, CUSTOM_MIN_MM, MM_PER_INCH, trimSize,
  type InvitationOptions, type SizeId,
} from "@/lib/invitation/options";

type PrintEvent = { id: string; label: string; side: Side; isPublished: boolean };
type Props = {
  weddingId: string;
  admin: boolean;
  brideParents: string | null;
  groomParents: string | null;
  contactPhone: string | null;
  hasDeadline: boolean;
  events: PrintEvent[];
};

type Form = Omit<InvitationOptions, "customWidthMm" | "customHeightMm" | "eventIds"> & {
  eventIds: string[];
  customW: string; customH: string; unit: "mm" | "in";
};

const defaultEvents = (events: PrintEvent[], version: Side) =>
  events.filter((e) => e.isPublished && eventForSide(e.side, version)).map((e) => e.id);

function initial(p: Props): Form {
  return {
    version: "both", size: "5x7", orientation: "portrait", eventLayout: "together",
    eventIds: defaultEvents(p.events, "both"), output: "printer", cropMarks: false, colours: "theme",
    invocation: "", brideParents: p.brideParents ?? "", groomParents: p.groomParents ?? "",
    rsvp: p.contactPhone ? `For RSVP  ${p.contactPhone}` : "", compliments: "", note: "",
    qr: true, dressCode: true, replyBy: p.hasDeadline,
    customW: "", customH: "", unit: "in",
  };
}

const storeKey = (id: string) => `print-invitation:${id}`;
const label = "text-xs font-medium uppercase tracking-wide text-neutral-500";

function Choice<T extends string>({ name, value, current, onPick, title, hint }: {
  name: string; value: T; current: T; onPick: (v: T) => void; title: string; hint?: string;
}) {
  const on = value === current;
  return (
    <label className={`flex cursor-pointer gap-2 rounded-xl border p-3 text-sm transition-colors ${on ? "border-stone-800 bg-white shadow-sm" : "border-neutral-200 bg-white/60 hover:border-neutral-300"}`}>
      <input type="radio" name={name} checked={on} onChange={() => onPick(value)} className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        <span className="font-medium text-neutral-800">{title}</span>
        {hint && <span className="mt-0.5 block text-xs text-neutral-500">{hint}</span>}
      </span>
    </label>
  );
}

/** "Print invitation cards": a few questions, then a print-ready PDF. */
export function PrintInvitation(props: Props) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(() => initial(props));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // answers are remembered on this device for the next print
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storeKey(props.weddingId));
      if (saved) {
        const s = JSON.parse(saved) as Partial<Form>;
        const known = new Set(props.events.map((e) => e.id));
        setForm((f) => ({ ...f, ...s, eventIds: (s.eventIds ?? f.eventIds).filter((id) => known.has(id)) }));
      }
    } catch { /* storage unavailable: start fresh */ }
  }, [props.weddingId, props.events]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const pickVersion = (version: Side) => setForm((f) => ({ ...f, version, eventIds: defaultEvents(props.events, version) }));
  const toggleEvent = (id: string) =>
    setForm((f) => ({ ...f, eventIds: f.eventIds.includes(id) ? f.eventIds.filter((x) => x !== id) : [...f.eventIds, id] }));

  const toMm = (v: string) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? Math.round((form.unit === "in" ? n * MM_PER_INCH : n) * 10) / 10 : NaN;
  };
  const customW = toMm(form.customW), customH = toMm(form.customH);
  const customOk = form.size !== "custom" || [customW, customH].every((n) => n >= CUSTOM_MIN_MM && n <= CUSTOM_MAX_MM);
  const sizeInfo = CARD_SIZES.find((s) => s.id === form.size);
  const square = form.size === "custom" ? customW === customH : sizeInfo ? sizeInfo.mm[0] === sizeInfo.mm[1] : false;

  const options = useMemo((): InvitationOptions => {
    const { customW: _w, customH: _h, unit: _u, ...rest } = form;
    void _w; void _h; void _u;
    return { ...rest, ...(form.size === "custom" ? { customWidthMm: customW, customHeightMm: customH } : {}) };
  }, [form, customW, customH]);

  const chosen = props.events.filter((e) => form.eventIds.includes(e.id));
  const details = form.qr || !!form.rsvp.trim() || !!form.compliments.trim() || !!form.note.trim() || (form.replyBy && props.hasDeadline);
  const separate = form.eventLayout === "separate";
  const pages = 1 + ((!separate && chosen.length) || details ? 1 : 0) + (separate ? chosen.length : 0);
  const [tw, th] = customOk ? trimSize(options) : [0, 0];

  async function download() {
    setBusy(true); setError(null); setDone(null);
    try { localStorage.setItem(storeKey(props.weddingId), JSON.stringify(form)); } catch { /* fine */ }
    try {
      const res = await fetch("/couple/invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weddingId: props.admin ? props.weddingId : undefined, options }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "failed");
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "invitation.pdf";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setDone(name);
    } catch (e) {
      setError(e instanceof Error && e.message !== "failed" ? `Couldn't make the PDF: ${e.message}` : "Couldn't make the PDF. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="portal-button-secondary">
        Print invitation cards
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 p-4 backdrop-blur-sm" role="dialog" aria-modal aria-labelledby="print-title">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-[#fcfbf9] p-6 shadow-2xl md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="portal-eyebrow">Printed cards</p>
            <h2 id="print-title" className="mt-1 text-xl font-semibold tracking-tight">Download invitation PDF to print</h2>
            <p className="mt-1 text-sm text-neutral-500">A traditional card in your site&apos;s style, ready for a print shop or your printer.</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="portal-icon-button" aria-label="Close">×</button>
        </div>

        <div className="mt-6 space-y-7 text-sm">
          {/* 1 — whose card */}
          <fieldset>
            <legend className={label}>1 · Whose invitation is this?</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <Choice name="version" value="bride" current={form.version} onPick={pickVersion} title="Bride's family" hint="Hosted by her parents; common + bride's events" />
              <Choice name="version" value="groom" current={form.version} onPick={pickVersion} title="Groom's family" hint="Hosted by his parents; common + groom's events" />
              <Choice name="version" value="both" current={form.version} onPick={pickVersion} title="Joint card" hint="From both families; every event" />
            </div>
          </fieldset>

          {/* 2 — size */}
          <fieldset>
            <legend className={label}>2 · Card size</legend>
            <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_auto]">
              <select aria-label="Card size" value={form.size} onChange={(e) => set("size", e.target.value as SizeId | "custom")} className="portal-input">
                {CARD_SIZES.map((s) => (
                  <option key={s.id} value={s.id}>{s.label} ({s.mm[0]} × {s.mm[1]} mm) — {s.note}</option>
                ))}
                <option value="custom">Custom size…</option>
              </select>
              {!square && (
                <div className="flex gap-1" role="radiogroup" aria-label="Orientation">
                  {(["portrait", "landscape"] as const).map((o) => (
                    <button key={o} type="button" role="radio" aria-checked={form.orientation === o} onClick={() => set("orientation", o)}
                      className={`rounded-lg border px-3 py-2 text-xs capitalize ${form.orientation === o ? "border-stone-800 bg-stone-800 text-white" : "border-neutral-300 bg-white text-neutral-600"}`}>
                      {o}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {form.size === "custom" && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input aria-label="Custom width" inputMode="decimal" value={form.customW} onChange={(e) => set("customW", e.target.value)} placeholder="Width" className="portal-input" style={{ width: "6.5rem" }} />
                <span className="text-neutral-400">×</span>
                <input aria-label="Custom height" inputMode="decimal" value={form.customH} onChange={(e) => set("customH", e.target.value)} placeholder="Height" className="portal-input" style={{ width: "6.5rem" }} />
                <select aria-label="Unit" value={form.unit} onChange={(e) => set("unit", e.target.value as "mm" | "in")} className="portal-input" style={{ width: "5.5rem" }}>
                  <option value="in">inches</option>
                  <option value="mm">mm</option>
                </select>
                {!customOk && (form.customW || form.customH) && (
                  <span className="text-xs text-red-700">Between {CUSTOM_MIN_MM} and {CUSTOM_MAX_MM} mm (3–11.7 in) each way.</span>
                )}
              </div>
            )}
          </fieldset>

          {/* 3 — events */}
          <fieldset>
            <legend className={label}>3 · How should the events be printed?</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Choice name="layout" value="together" current={form.eventLayout} onPick={(v) => set("eventLayout", v)} title="On the back of the card" hint="Invitation on the front, all events listed on the back" />
              <Choice name="layout" value="separate" current={form.eventLayout} onPick={(v) => set("eventLayout", v)} title="A separate card for each event" hint="Invitation card plus one insert card per event" />
            </div>
            <p className="mt-3 text-xs text-neutral-500">Events on this card:</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {props.events.map((e) => {
                const on = form.eventIds.includes(e.id);
                return (
                  <button key={e.id} type="button" aria-pressed={on} onClick={() => toggleEvent(e.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs ${on ? "border-stone-800 bg-stone-800 text-white" : "border-neutral-300 bg-white text-neutral-600"}`}>
                    {e.label}{!e.isPublished ? " (hidden on site)" : ""}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* 4 — wording */}
          <fieldset>
            <legend className={label}>4 · Wording</legend>
            <p className="mt-1 text-xs text-neutral-500">Printed as typed. English letters only for now — Hindi or Marathi script won&apos;t print yet.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-xs text-neutral-600">Invocation at the top (optional)</span>
                <input value={form.invocation} onChange={(e) => set("invocation", e.target.value)} maxLength={80} placeholder="|| Shree Ganeshaya Namah ||" className="portal-input mt-1" />
              </label>
              <label className="block">
                <span className="text-xs text-neutral-600">Bride&apos;s parents</span>
                <input value={form.brideParents} onChange={(e) => set("brideParents", e.target.value)} maxLength={160} placeholder="Mr. & Mrs. Anil Kulkarni" className="portal-input mt-1" />
              </label>
              <label className="block">
                <span className="text-xs text-neutral-600">Groom&apos;s parents</span>
                <input value={form.groomParents} onChange={(e) => set("groomParents", e.target.value)} maxLength={160} placeholder="Mr. & Mrs. Rajesh Kosambi" className="portal-input mt-1" />
              </label>
              <label className="block">
                <span className="text-xs text-neutral-600">RSVP contacts (one per line)</span>
                <textarea value={form.rsvp} onChange={(e) => set("rsvp", e.target.value)} maxLength={240} rows={2} placeholder={"Rajesh Kosambi  +91 98220 12345\nSonu  +91 98765 43210"} className="portal-input mt-1 resize-none" />
              </label>
              <label className="block">
                <span className="text-xs text-neutral-600">“With best compliments from” (optional)</span>
                <textarea value={form.compliments} onChange={(e) => set("compliments", e.target.value)} maxLength={240} rows={2} placeholder={"Kosambi & Kulkarni families\nand friends"} className="portal-input mt-1 resize-none" />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs text-neutral-600">Closing line (optional)</span>
                <input value={form.note} onChange={(e) => set("note", e.target.value)} maxLength={160} placeholder="Your blessings are our gifts" className="portal-input mt-1" />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.qr} onChange={(e) => set("qr", e.target.checked)} className="h-4 w-4" /> QR code to the wedding website</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.dressCode} onChange={(e) => set("dressCode", e.target.checked)} className="h-4 w-4" /> Dress codes</label>
              {props.hasDeadline && (
                <label className="flex items-center gap-2"><input type="checkbox" checked={form.replyBy} onChange={(e) => set("replyBy", e.target.checked)} className="h-4 w-4" /> “Kindly reply by” date</label>
              )}
            </div>
          </fieldset>

          {/* 5 — printing */}
          <fieldset>
            <legend className={label}>5 · Where will you print?</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Choice name="output" value="printer" current={form.output} onPick={(v) => set("output", v)} title="Print shop" hint={`Exact card size plus ${BLEED_MM} mm bleed on every side`} />
              <Choice name="output" value="home" current={form.output} onPick={(v) => set("output", v)} title="Home or office printer" hint="One card per A4 sheet, with cut marks" />
            </div>
            {form.output === "printer" && (
              <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={form.cropMarks} onChange={(e) => set("cropMarks", e.target.checked)} className="h-4 w-4" /> Add crop marks (only if your printer asks for them)</label>
            )}
            <p className="mt-4 text-xs text-neutral-500">Colours</p>
            <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
              <Choice name="colours" value="theme" current={form.colours} onPick={(v) => set("colours", v)} title="Your website's colours" hint="Full-colour card in your theme" />
              <Choice name="colours" value="light" current={form.colours} onPick={(v) => set("colours", v)} title="White card, coloured ink" hint="Cheaper; best for home printing" />
            </div>
          </fieldset>
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-5">
          <p className="text-xs text-neutral-500" data-testid="print-summary">
            {customOk
              ? `${pages} ${pages === 1 ? "page" : "pages"} · card ${tw} × ${th} mm${form.output === "printer" ? ` (${tw + 2 * BLEED_MM} × ${th + 2 * BLEED_MM} mm with bleed)` : " on A4"}`
              : "Enter a custom size"}
            {chosen.length === 0 && " · no events selected"}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)} className="portal-button-secondary">Close</button>
            <button type="button" onClick={download} disabled={busy || !customOk} className="portal-button">
              {busy ? "Making PDF…" : "Download PDF"}
            </button>
          </div>
        </div>
        {done && <p className="mt-3 text-right text-xs text-emerald-700" role="status">Downloaded {done}. Change any answer to make another version.</p>}
        {error && <p className="mt-3 text-right text-xs text-red-700" role="alert">{error}</p>}
      </div>
    </div>
  );
}
