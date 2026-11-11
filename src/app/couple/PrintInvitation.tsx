"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { adoptCardWordingAction } from "./actions";
import { eventForSide, type Side } from "@/lib/sides";
import type { Theme } from "@/themes/catalog";
import {
  BLEED_MM, CARD_SIZES, CUSTOM_MAX_MM, CUSTOM_MIN_MM, MAX_PHOTO_CHARS, MM_PER_INCH, MONOGRAM_STYLES,
  defaultMonogram, isPortrait, trimSize, type InvitationOptions, type MonogramStyle, type SizeId,
} from "@/lib/invitation/options";
import { crest, paletteFor, type Motif, type Palette } from "@/lib/invitation/motifs";
import {
  BORDER_STYLES, BORDER_LABELS, PATTERNS, PATTERN_LABELS, SYMBOLS, SYMBOL_LABELS, OM,
  backgroundPattern, borderBand, symbol as symbolMotif,
} from "@/lib/invitation/decor";
import { MotifSvg as Art } from "@/components/MotifSvg";

type PrintEvent = { id: string; label: string; side: Side; isPublished: boolean };
type Props = {
  weddingId: string;
  admin: boolean;
  /** whose cards these are: each family prints its own */
  family: "bride" | "groom";
  /** where the parents' names are edited */
  siteEditorHref: string;
  /** where this family's wording is edited (Edit your site) */
  wordingHref: string;
  /** this family's wording, from its site: printed as is */
  wording: CardWording;
  theme: Theme;
  brideName: string;
  groomName: string;
  brideParents: string | null;
  groomParents: string | null;
  hasDeadline: boolean;
  events: PrintEvent[];
};

export type CardWording = { invocation: string | null; shloka: string | null; rsvpContacts: string | null; compliments: string | null; closingLine: string | null };

/** The words come from the site; the PDF route fills them in. */
type WordingOption = "invocation" | "shloka" | "rsvpBride" | "rsvpGroom" | "complimentsBride" | "complimentsGroom" | "note";
type SentOptions = Omit<InvitationOptions, WordingOption>;

type Form = Omit<InvitationOptions, "customWidthMm" | "customHeightMm" | "eventIds" | "photo" | WordingOption> & {
  eventIds: string[]; photo: string | null; customW: string; customH: string; unit: "mm" | "in";
};

const defaultEvents = (events: PrintEvent[], version: Side) =>
  events.filter((e) => e.isPublished && eventForSide(e.side, version)).map((e) => e.id);

function initial(p: Props): Form {
  return {
    version: p.family, size: "5x7", orientation: "portrait", eventLayout: "together",
    eventIds: defaultEvents(p.events, p.family), output: "printer", cropMarks: false, colours: "theme",
    qr: true, dressCode: true, replyBy: p.hasDeadline,
    frame: "classic", toran: false, patternBorder: false, borderStyle: "diamond", pattern: "none", symbol: "motif", icons: false, monogram: false, monogramText: "", monogramStyle: "circle",
    fill: "classic", nameFont: "serif", photo: null, photoPlace: "front", photoShape: "arch",
    customW: "", customH: "", unit: "in",
  };
}

/** Answers saved by an earlier version of this dialog, made to fit this one. */
function fromSaved(base: Form, saved: Record<string, unknown>): Form {
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(base)) if (k in saved && saved[k] !== undefined) out[k] = saved[k];
  if (out.version !== "bride" && out.version !== "groom") out.version = base.version;
  return out as Form;
}

/** Wording typed in this dialog before it moved to Edit your site, if any. */
function oldWording(saved: Record<string, unknown>, family: "bride" | "groom"): CardWording | null {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  const w: CardWording = {
    invocation: str(saved.invocation),
    shloka: str(saved.shloka),
    rsvpContacts: str(family === "bride" ? saved.rsvpBride ?? saved.rsvp : saved.rsvpGroom ?? saved.rsvp),
    compliments: str(family === "bride" ? saved.complimentsBride ?? saved.compliments : saved.complimentsGroom ?? saved.compliments),
    closingLine: str(saved.note),
  };
  return Object.values(w).some(Boolean) ? w : null;
}
const WORDING_LABELS: Record<keyof CardWording, string> = {
  invocation: "Invocation", shloka: "Blessing or shloka", rsvpContacts: "RSVP contacts", compliments: "With best compliments from", closingLine: "Closing line",
};

const storeKey = (id: string, family: "bride" | "groom") => `print-invitation:${id}:${family}`;
/** old wording kept aside until it's moved to the site or set aside */
const oldWordingKey = (id: string, family: "bride" | "groom") => `print-wording:${id}:${family}`;
const legacyKey = (id: string) => `print-invitation:${id}`;
/** What "same as your partner's card" copies: the setup and design — not
    whose card it is or its events (the wording has its own "Same as" on the site). */
const SHARED_KEYS = [
  "size", "orientation", "eventLayout", "output", "cropMarks", "colours", "qr", "dressCode", "replyBy",
  "frame", "toran", "patternBorder", "borderStyle", "pattern", "symbol", "icons", "monogram", "monogramStyle", "fill", "nameFont", "photo", "photoPlace", "photoShape", "customW", "customH", "unit",
] as const;
const readSaved = (key: string): Record<string, unknown> | null => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
};
const STEPS = ["Setup", "Design"] as const;
type Step = 1 | 2;
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

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </label>
  );
}

/** A picture choice in a radio group (borders, symbols, patterns). */
function Thumb({ label, on, bg, onPick, children }: { label: string; on: boolean; bg: string; onPick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={on} aria-label={label} onClick={onPick}
      className={`flex flex-col items-center gap-1 rounded-xl p-1.5 text-[11px] ${on ? "ring-2 ring-stone-800" : "ring-1 ring-neutral-200 hover:ring-neutral-400"}`}>
      <span className="grid place-items-center rounded-lg p-1.5" style={{ background: bg }}>{children}</span>
      <span className={on ? "font-medium text-stone-900" : "text-neutral-600"}>{label}</span>
    </button>
  );
}

/** A motif drawn in the page, for the monogram picker. */
function MotifSvg({ m, p, size, text, textY, textSize }: { m: Motif; p: Palette; size: number; text?: string; textY?: number; textSize?: number }) {
  const col = (k?: string) => (k ? (p as Record<string, string>)[k] : "none");
  return (
    <svg viewBox={`0 0 ${m.w} ${m.h}`} width={size} height={(size * m.h) / m.w} aria-hidden>
      {m.shapes.map((s, i) => {
        const paint = { fill: col(s.fill), stroke: s.stroke ? col(s.stroke) : undefined, strokeWidth: s.sw, opacity: s.op };
        if (s.k === "circle") return <circle key={i} cx={s.cx} cy={s.cy} r={s.r} {...paint} />;
        if (s.k === "line") return <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={col(s.stroke ?? "hair")} strokeWidth={s.sw ?? 1} opacity={s.op} />;
        return <path key={i} d={s.d} {...paint} />;
      })}
      {text && (
        <text x={50} y={(textY ?? 50) + (textSize ?? 18) * 0.36} textAnchor="middle" fontFamily="Georgia, serif" fontSize={(textSize ?? 18) * Math.min(1, 5 / Math.max(text.replace(/\s/g, "").length, 2))} fill={p.accent} letterSpacing={1}>
          {text}
        </text>
      )}
    </svg>
  );
}

/** Shrink a photo in the browser so it uploads quickly and prints sharp enough. */
async function shrinkPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fail(new Error("not an image"));
      i.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.85, 0.72, 0.6]) {
      const data = canvas.toDataURL("image/jpeg", q);
      if (data.length < MAX_PHOTO_CHARS) return data;
    }
    throw new Error("too large");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ── the live preview: the actual PDF, drawn by pdf.js ─────────── */
type PdfJs = typeof import("pdfjs-dist");
let pdfjsReady: Promise<PdfJs> | null = null;
function loadPdfJs(): Promise<PdfJs> {
  pdfjsReady ??= import("pdfjs-dist").then((pdfjs) => {
    if (!pdfjs.GlobalWorkerOptions.workerPort) {
      pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
    }
    return pdfjs;
  });
  return pdfjsReady;
}

function PdfPages({ pdf }: { pdf: Blob | null }) {
  const holder = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState(0);
  useEffect(() => {
    if (!pdf || !holder.current) return;
    let cancelled = false;
    (async () => {
      const pdfjs = await loadPdfJs();
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await pdf.arrayBuffer()) }).promise;
      if (cancelled) return;
      const box = holder.current!;
      const canvases: HTMLCanvasElement[] = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const cssW = Math.min(280, box.clientWidth || 280);
        const ratio = window.devicePixelRatio || 1;
        const vp = page.getViewport({ scale: (cssW / base.width) * ratio });
        const canvas = document.createElement("canvas");
        canvas.width = vp.width;
        canvas.height = vp.height;
        canvas.style.width = `${cssW}px`;
        canvas.className = "mx-auto block rounded shadow-md ring-1 ring-black/5";
        canvas.setAttribute("aria-label", `Page ${n} of the invitation`);
        canvas.setAttribute("role", "img");
        await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
        if (cancelled) return;
        canvases.push(canvas);
      }
      box.replaceChildren(...canvases.flatMap((c, i) => {
        const cap = document.createElement("p");
        cap.className = "mb-4 mt-1.5 text-center text-[11px] text-neutral-500";
        cap.textContent = i === 0 ? "Front" : i === 1 && canvases.length > 1 ? "Page 2" : `Page ${i + 1}`;
        return [c, cap];
      }));
      setPages(doc.numPages);
      void doc.destroy();
    })().catch(() => { /* the status line reports failures */ });
    return () => { cancelled = true; };
  }, [pdf]);
  return <div ref={holder} data-testid="pdf-preview" data-pages={pages} className="space-y-0" />;
}

/** "Print invitation cards": the questions, the design, a live preview, the PDF. */
export function PrintInvitation(props: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<Form>(() => initial(props));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ key: string; blob: Blob; name: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // answers are remembered on this device for the next print
  const router = useRouter();
  const [moved, setMoved] = useState<CardWording | null>(null);
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    const saved = readSaved(storeKey(props.weddingId, props.family)) ?? readSaved(legacyKey(props.weddingId));
    // wording typed here before it moved to the site: offer to move it
    const kept = readSaved(oldWordingKey(props.weddingId, props.family)) as CardWording | null;
    const old = kept ?? (saved ? oldWording(saved, props.family) : null);
    if (old) {
      try { localStorage.setItem(oldWordingKey(props.weddingId, props.family), JSON.stringify(old)); } catch { /* fine */ }
      setMoved(old);
    }
    if (saved) {
      const known = new Set(props.events.map((e) => e.id));
      setForm((f) => {
        const next = fromSaved(f, saved);
        // always this family's card
        return { ...next, version: props.family, eventIds: next.eventIds.filter((id) => known.has(id)) };
      });
    }
    setPartnerSaved(!!readSaved(storeKey(props.weddingId, props.family === "bride" ? "groom" : "bride")));
  }, [props.weddingId, props.events, props.family]);

  const [partnerSaved, setPartnerSaved] = useState(false);
  function copyPartner() {
    const other = readSaved(storeKey(props.weddingId, props.family === "bride" ? "groom" : "bride"));
    if (!other) return;
    setForm((f) => {
      const next: Record<string, unknown> = { ...f };
      for (const k of SHARED_KEYS) if (k in other) next[k] = other[k];
      return next as Form;
    });
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
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

  // only what the site's wording doesn't already say
  const toMove = moved && (Object.keys(moved) as (keyof CardWording)[]).filter((k) => moved[k] && !props.wording[k]);
  function forgetOld() {
    try { localStorage.removeItem(oldWordingKey(props.weddingId, props.family)); } catch { /* fine */ }
    setMoved(null);
  }
  async function moveOld() {
    if (!moved) return;
    setMoving(true);
    const wording = Object.fromEntries(Object.entries(moved).filter(([, v]) => typeof v === "string" && v));
    const r = await adoptCardWordingAction({ weddingId: props.weddingId, family: props.family, wording }).catch(() => ({ ok: false }));
    setMoving(false);
    if (r.ok) { forgetOld(); router.refresh(); } else setError("Couldn't move the wording. Please try again.");
  }

  const options = useMemo((): SentOptions => {
    const { customW: _w, customH: _h, unit: _u, photo, ...rest } = form;
    void _w; void _h; void _u;
    return {
      ...rest,
      ...(photo ? { photo } : {}),
      ...(form.size === "custom" ? { customWidthMm: customW, customHeightMm: customH } : {}),
    };
  }, [form, customW, customH]);
  // a change to the site's wording redraws the preview too
  const optionsKey = useMemo(() => JSON.stringify({ options, wording: props.wording }), [options, props.wording]);

  const chosen = props.events.filter((e) => form.eventIds.includes(e.id));
  const details = form.qr || !!props.wording.rsvpContacts || !!props.wording.compliments
    || !!props.wording.closingLine || (form.replyBy && props.hasDeadline);
  const separate = form.eventLayout === "separate";
  const backPhoto = !!form.photo && form.photoPlace === "back";
  const pages = 1 + ((!separate && chosen.length) || details || backPhoto ? 1 : 0) + (separate ? chosen.length : 0);
  const [tw, th] = customOk ? trimSize(options) : [0, 0];
  const palette = paletteFor(props.theme, form.colours);
  const portrait = customOk && isPortrait(options);
  const monoDefault = defaultMonogram(props.brideName, props.groomName, form.version);

  async function makePdf(): Promise<{ blob: Blob; name: string }> {
    const res = await fetch("/couple/invitation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weddingId: props.admin ? props.weddingId : undefined, options }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "failed");
    const blob = await res.blob();
    const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "invitation.pdf";
    return { blob, name };
  }

  // redraw the preview a moment after the last change, on every page
  useEffect(() => {
    if (!open || !customOk || preview?.key === optionsKey) return;
    let stale = false;
    const t = setTimeout(async () => {
      setPreviewing(true); setError(null);
      try {
        const made = await makePdf();
        if (!stale) setPreview({ key: optionsKey, ...made });
      } catch (e) {
        if (!stale) setError(e instanceof Error && e.message !== "failed" ? `Couldn't draw the preview: ${e.message}` : "Couldn't draw the preview. Please try again.");
      } finally {
        if (!stale) setPreviewing(false);
      }
    }, 650);
    return () => { stale = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, optionsKey, customOk]);

  function remember() {
    try {
      localStorage.setItem(storeKey(props.weddingId, props.family), JSON.stringify(form));
    } catch {
      try { localStorage.setItem(storeKey(props.weddingId, props.family), JSON.stringify({ ...form, photo: null })); } catch { /* fine */ }
    }
  }

  async function download() {
    setBusy(true); setError(null); setDone(null);
    remember();
    try {
      const made = preview?.key === optionsKey ? preview : await makePdf();
      const url = URL.createObjectURL(made.blob);
      const a = document.createElement("a");
      a.href = url; a.download = made.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setDone(made.name);
    } catch (e) {
      setError(e instanceof Error && e.message !== "failed" ? `Couldn't make the PDF: ${e.message}` : "Couldn't make the PDF. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function addPhoto(file: File | undefined) {
    setPhotoError(null);
    if (!file) return;
    try {
      set("photo", await shrinkPhoto(file));
    } catch {
      setPhotoError("That file couldn't be used. Try a JPEG or PNG photo.");
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => { setOpen(true); setStep(1); }} className="portal-button-secondary">
        Print invitation cards
      </button>
    );
  }

  const summary = customOk
    ? `${pages} ${pages === 1 ? "page" : "pages"} · card ${tw} × ${th} mm${form.output === "printer" ? ` (${tw + 2 * BLEED_MM} × ${th + 2 * BLEED_MM} mm with bleed)` : " on A4"}${chosen.length === 0 ? " · no events selected" : ""}`
    : "Enter a custom size";

  const go = (to: Step) => { remember(); setStep(to); };
  const parentsLine = (who: string, names: string | null) => (
    <p>
      <span className="text-neutral-500">{who}:</span>{" "}
      {names ? <span className="text-neutral-800">{names}</span> : <span className="italic text-neutral-400">not set — “The family of …” prints instead</span>}
    </p>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 p-4 backdrop-blur-sm" role="dialog" aria-modal aria-labelledby="print-title">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-[#fcfbf9] p-6 shadow-2xl md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="portal-eyebrow">Printed cards</p>
            <h2 id="print-title" className="mt-1 text-xl font-semibold tracking-tight">Download invitation PDF to print</h2>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="portal-icon-button" aria-label="Close">×</button>
        </div>

        {/* the three pages, also clickable */}
        <ol className="mt-5 flex flex-wrap gap-2 text-xs" aria-label="Steps">
          {STEPS.map((st, i) => {
            const n = (i + 1) as Step;
            const on = step === n;
            return (
              <li key={st}>
                <button type="button" onClick={() => customOk && go(n)} aria-current={on ? "step" : undefined}
                  className={`rounded-full px-3 py-1.5 ${on ? "bg-stone-800 text-white" : "bg-white text-neutral-600 ring-1 ring-neutral-200 hover:ring-neutral-400"}`}>
                  {n} · {st}
                </button>
              </li>
            );
          })}
        </ol>

        <div className="mt-6 grid gap-8 text-sm md:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-7">
            {step === 1 && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white px-3 py-2.5 text-xs ring-1 ring-neutral-200">
                  <p className="text-neutral-600">
                    The <span className="font-medium text-neutral-800">{props.family === "bride" ? "bride" : "groom"}&apos;s family&apos;s</span> card — hosted by their parents, with the common events and their own.
                  </p>
                  {partnerSaved && (
                    <button type="button" onClick={copyPartner} className="portal-button-secondary">
                      Same as the {props.family === "bride" ? "groom" : "bride"}&apos;s family&apos;s card
                    </button>
                  )}
                </div>

                {toMove && toMove.length > 0 && (
                  <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-900 ring-1 ring-amber-200" data-testid="move-wording">
                    <p className="font-medium">The card&apos;s wording now lives in Edit your site, so your website shows it too.</p>
                    <p className="mt-1">You typed some here earlier — {toMove.map((k) => WORDING_LABELS[k]).join(", ")}. Move it there?</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" onClick={moveOld} disabled={moving} className="portal-button">{moving ? "Moving…" : "Move it to my site"}</button>
                      <button type="button" onClick={forgetOld} className="portal-button-secondary">No thanks</button>
                    </div>
                  </div>
                )}

                <div className="rounded-lg bg-white px-3 py-2.5 text-xs ring-1 ring-neutral-200" data-testid="card-wording">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium text-neutral-700">Wording on the card — the same as on your website</p>
                    <a href={props.wordingHref} className="underline">Change it in Edit your site</a>
                  </div>
                  <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                    {(Object.keys(WORDING_LABELS) as (keyof CardWording)[]).map((k) => (
                      <div key={k} className="contents">
                        <dt className="text-neutral-500">{WORDING_LABELS[k]}</dt>
                        <dd className={props.wording[k] ? "whitespace-pre-line text-neutral-800" : "italic text-neutral-400"}>{props.wording[k] ?? "not set"}</dd>
                      </div>
                    ))}
                    <dt className="text-neutral-500">Parents</dt>
                    <dd className="text-neutral-800">
                      {[props.brideParents, props.groomParents].filter(Boolean).join(" · ") || <span className="italic text-neutral-400">not set — “The family of …” prints instead</span>}
                      {" "}<a href={props.siteEditorHref} className="text-neutral-500 underline">on the dashboard</a>
                    </dd>
                  </dl>
                </div>

                <fieldset>
                  <legend className={label}>Card size</legend>
                  <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_auto]">
                    <select aria-label="Card size" value={form.size} onChange={(e) => set("size", e.target.value as SizeId | "custom")} className="portal-input">
                      {CARD_SIZES.map((sz) => (
                        <option key={sz.id} value={sz.id}>{sz.label} ({sz.mm[0]} × {sz.mm[1]} mm) — {sz.note}</option>
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

                <fieldset>
                  <legend className={label}>How should the events be printed?</legend>
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

                <fieldset>
                  <legend className={label}>Where will you print?</legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <Choice name="output" value="printer" current={form.output} onPick={(v) => set("output", v)} title="Print shop" hint={`Exact card size plus ${BLEED_MM} mm bleed on every side`} />
                    <Choice name="output" value="home" current={form.output} onPick={(v) => set("output", v)} title="Home or office printer" hint="One card per A4 sheet, with cut marks" />
                  </div>
                  {form.output === "printer" && (
                    <div className="mt-2"><Check checked={form.cropMarks} onChange={(v) => set("cropMarks", v)}>Add crop marks (only if your printer asks for them)</Check></div>
                  )}
                </fieldset>

                <fieldset>
                  <legend className={label}>Colours</legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <Choice name="colours" value="theme" current={form.colours} onPick={(v) => set("colours", v)} title="Your website's colours" hint="Full-colour card in your theme" />
                    <Choice name="colours" value="light" current={form.colours} onPick={(v) => set("colours", v)} title="White card, coloured ink" hint="Cheaper; best for home printing" />
                  </div>
                </fieldset>
              </>
            )}

            {step === 2 && (
              <>
                <p className="rounded-lg bg-white px-3 py-2 text-xs text-neutral-600 ring-1 ring-neutral-200">
                  Your theme&apos;s motifs — the ornament, dividers and corners from your website — are on every card.
                </p>

                <fieldset>
                  <legend className={label}>Frame and ornaments</legend>
                  {portrait ? (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <Choice name="frame" value="classic" current={form.frame} onPick={(v) => set("frame", v)} title="Classic frame" hint="A fine double rule" />
                      <Choice name="frame" value="arch" current={form.frame} onPick={(v) => set("frame", v)} title="Arch frame" hint="Names inside a temple arch (mehrab)" />
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-neutral-500">Classic frame. The arch frame is for portrait cards — choose a portrait size on step 1 to use it.</p>
                  )}
                  <div className="mt-3 space-y-2">
                    <Check checked={form.toran} onChange={(v) => set("toran", v)}>Toran across the top <span className="text-xs text-neutral-500">— mango leaves and marigolds</span></Check>
                  </div>
                </fieldset>

                <fieldset>
                  <legend className={label}>Border</legend>
                  <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Border">
                    <Thumb label="Classic rule" on={!form.patternBorder} bg={palette.bg} onPick={() => set("patternBorder", false)}>
                      <svg viewBox="0 0 60 78" width={52} aria-hidden><rect x="1" y="1" width="58" height="76" fill="none" stroke={palette.accent} strokeWidth="1" /><rect x="4" y="4" width="52" height="70" fill="none" stroke={palette.accent} strokeWidth="0.4" /></svg>
                    </Thumb>
                    {BORDER_STYLES.map((b) => (
                      <Thumb key={b} label={BORDER_LABELS[b]} on={form.patternBorder && form.borderStyle === b} bg={palette.bg}
                        onPick={() => setForm((f) => ({ ...f, patternBorder: true, borderStyle: b }))}>
                        <Art m={borderBand(60, 78, 7, b)} colours={palette} width={52} />
                      </Thumb>
                    ))}
                  </div>
                </fieldset>

                <fieldset>
                  <legend className={label}>Symbol at the top</legend>
                  <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Symbol at the top">
                    {SYMBOLS.map((sy) => (
                      <Thumb key={sy} label={SYMBOL_LABELS[sy]} on={form.symbol === sy} bg={palette.bg} onPick={() => set("symbol", sy)}>
                        {sy === "motif" ? <span className="grid h-[44px] w-[44px] place-items-center text-lg" style={{ color: palette.hair }}>—</span>
                          : sy === "om" ? <span className="indic grid h-[44px] w-[44px] place-items-center text-3xl leading-none" style={{ color: palette.accent }}>{OM}</span>
                          : <Art m={symbolMotif(sy)} colours={palette} width={44} />}
                      </Thumb>
                    ))}
                  </div>
                </fieldset>

                <fieldset>
                  <legend className={label}>Background pattern</legend>
                  <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Background pattern">
                    {PATTERNS.map((pt) => (
                      <Thumb key={pt} label={PATTERN_LABELS[pt]} on={form.pattern === pt} bg={palette.bg} onPick={() => set("pattern", pt)}>
                        {pt === "none" ? <span className="block h-[68px] w-[52px]" /> : <Art m={backgroundPattern(60, 78, pt)} colours={palette} width={52} style={{ filter: "brightness(1.6) contrast(1.6)" }} />}
                      </Thumb>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-neutral-500">Printed faintly behind the words (shown stronger here).</p>
                </fieldset>

                <fieldset>
                  <legend className={label}>Monogram crest</legend>
                  <div className="mt-2"><Check checked={form.monogram} onChange={(v) => set("monogram", v)}>Add your monogram to the card</Check></div>
                  {form.monogram && (
                    <div className="mt-3 space-y-3">
                      <label className="block max-w-xs">
                        <span className="text-xs text-neutral-600">Letters</span>
                        <input value={form.monogramText} onChange={(e) => set("monogramText", e.target.value)} maxLength={9} placeholder={monoDefault} className="portal-input mt-1" />
                      </label>
                      <div>
                        <p className="text-xs text-neutral-600">Generated logos — pick one</p>
                        <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup" aria-label="Monogram style">
                          {MONOGRAM_STYLES.map((st: MonogramStyle) => {
                            const cr = crest(st);
                            const on = form.monogramStyle === st;
                            return (
                              <button key={st} type="button" role="radio" aria-checked={on} aria-label={`${st} crest`} onClick={() => set("monogramStyle", st)}
                                className={`rounded-xl p-2 ${on ? "ring-2 ring-stone-800" : "ring-1 ring-neutral-200 hover:ring-neutral-400"}`}
                                style={{ background: palette.bg }}>
                                <MotifSvg m={cr} p={palette} size={64} text={form.monogramText || monoDefault} textY={cr.textY} textSize={cr.textSize} />
                                <span className="mt-1 block text-[11px] capitalize" style={{ color: palette.soft }}>{st}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </fieldset>

                <fieldset>
                  <legend className={label}>Lettering</legend>
                  <p className="mt-1 text-xs text-neutral-500">Applies to every card in the set.</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <Choice name="fill" value="classic" current={form.fill} onPick={(v) => set("fill", v)} title="Classic spacing" hint="Airy, with room around the words" />
                    <Choice name="fill" value="fuller" current={form.fill} onPick={(v) => set("fill", v)} title="Fill the card" hint="Larger lettering that uses the space" />
                    <Choice name="names" value="serif" current={form.nameFont} onPick={(v) => set("nameFont", v)} title="Names in serif" hint="Tall classic capitals" />
                    <Choice name="names" value="script" current={form.nameFont} onPick={(v) => set("nameFont", v)} title="Names in script" hint="Flowing calligraphy" />
                  </div>
                </fieldset>

                <fieldset>
                  <legend className={label}>Photo</legend>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {form.photo ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={form.photo} alt="Your photo" className="h-16 w-16 rounded-lg object-cover ring-1 ring-neutral-200" />
                        <button type="button" onClick={() => set("photo", null)} className="portal-button-secondary">Remove photo</button>
                      </>
                    ) : (
                      <label className="portal-button-secondary cursor-pointer">
                        Add a photo
                        <input type="file" accept="image/jpeg,image/png" className="sr-only" aria-label="Add a photo" onChange={(e) => addPhoto(e.target.files?.[0])} />
                      </label>
                    )}
                  </div>
                  {photoError && <p className="mt-2 text-xs text-red-700">{photoError}</p>}
                  {form.photo && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Choice name="photoPlace" value="front" current={form.photoPlace} onPick={(v) => set("photoPlace", v)} title="On the front" hint="Above the invitation" />
                      <Choice name="photoPlace" value="back" current={form.photoPlace} onPick={(v) => set("photoPlace", v)} title="On the back" hint="Above the celebrations" />
                      <Choice name="photoShape" value="arch" current={form.photoShape} onPick={(v) => set("photoShape", v)} title="Arch-shaped" />
                      <Choice name="photoShape" value="circle" current={form.photoShape} onPick={(v) => set("photoShape", v)} title="Round" />
                    </div>
                  )}
                </fieldset>

                <fieldset>
                  <legend className={label}>Also on the card</legend>
                  <div className="mt-2 space-y-2">
                    <Check checked={form.qr} onChange={(v) => set("qr", v)}>QR code to the wedding website <span className="text-xs text-neutral-500">— on the back, for guests to RSVP</span></Check>
                    <Check checked={form.icons} onChange={(v) => set("icons", v)}>Celebration icons <span className="text-xs text-neutral-500">— a small drawing beside each event (haldi bowl, mehendi, dhol…)</span></Check>
                    <Check checked={form.dressCode} onChange={(v) => set("dressCode", v)}>Dress codes <span className="text-xs text-neutral-500">— under each celebration</span></Check>
                    {props.hasDeadline && <Check checked={form.replyBy} onChange={(v) => set("replyBy", v)}>“Kindly reply by” date</Check>}
                  </div>
                </fieldset>
              </>
            )}
          </div>

          <aside className="md:sticky md:top-0 md:self-start" aria-label="Preview">
            <div className="flex items-center justify-between">
              <p className={label}>Preview</p>
              <span className="text-xs text-neutral-500" role="status" data-testid="preview-status">
                {previewing ? "Updating…" : preview?.key === optionsKey ? "Up to date" : ""}
              </span>
            </div>
            <div className={`mt-3 max-h-[64vh] overflow-y-auto rounded-xl bg-neutral-100 p-4 transition-opacity ${previewing ? "opacity-60" : ""}`}>
              {!preview && <p className="py-16 text-center text-xs text-neutral-500">{customOk ? "Drawing your cards…" : "Enter a custom size to see the cards."}</p>}
              <PdfPages pdf={preview?.blob ?? null} />
            </div>
          </aside>
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-5">
          <p className="text-xs text-neutral-500" data-testid="print-summary">{summary}</p>
          <div className="flex gap-2">
            {step === 1
              ? <button type="button" onClick={() => setOpen(false)} className="portal-button-secondary">Close</button>
              : <button type="button" onClick={() => go((step - 1) as Step)} className="portal-button-secondary">← Back</button>}
            {step < 2 ? (
              <button type="button" onClick={() => go((step + 1) as Step)} disabled={!customOk} className="portal-button">
                Next: design →
              </button>
            ) : (
              <button type="button" onClick={download} disabled={busy || !customOk} className="portal-button">
                {busy ? "Making PDF…" : "Download PDF"}
              </button>
            )}
          </div>
        </div>
        {done && <p className="mt-3 text-right text-xs text-emerald-700" role="status">Downloaded {done}. Change anything to make another version.</p>}
        {error && <p className="mt-3 text-right text-xs text-red-700" role="alert">{error}</p>}
      </div>
    </div>
  );
}
