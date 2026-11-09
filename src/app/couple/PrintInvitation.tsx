"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { eventForSide, type Side } from "@/lib/sides";
import type { Theme } from "@/themes/catalog";
import {
  BLEED_MM, CARD_SIZES, CUSTOM_MAX_MM, CUSTOM_MIN_MM, MAX_PHOTO_CHARS, MM_PER_INCH, MONOGRAM_STYLES,
  defaultMonogram, trimSize, type InvitationOptions, type MonogramStyle, type SizeId,
} from "@/lib/invitation/options";
import { crest, paletteFor, type Motif, type Palette } from "@/lib/invitation/motifs";

type PrintEvent = { id: string; label: string; side: Side; isPublished: boolean };
type Props = {
  weddingId: string;
  admin: boolean;
  theme: Theme;
  brideName: string;
  groomName: string;
  brideParents: string | null;
  groomParents: string | null;
  contactPhone: string | null;
  hasDeadline: boolean;
  events: PrintEvent[];
};

type Form = Omit<InvitationOptions, "customWidthMm" | "customHeightMm" | "eventIds" | "photo"> & {
  eventIds: string[]; photo: string | null; customW: string; customH: string; unit: "mm" | "in";
};

const defaultEvents = (events: PrintEvent[], version: Side) =>
  events.filter((e) => e.isPublished && eventForSide(e.side, version)).map((e) => e.id);

function initial(p: Props): Form {
  return {
    version: "both", size: "5x7", orientation: "portrait", eventLayout: "together",
    eventIds: defaultEvents(p.events, "both"), output: "printer", cropMarks: false, colours: "theme",
    invocation: "", brideParents: p.brideParents ?? "", groomParents: p.groomParents ?? "",
    rsvp: p.contactPhone ? `For RSVP ${p.contactPhone}` : "", compliments: "", note: "",
    qr: true, dressCode: true, replyBy: p.hasDeadline,
    frame: "classic", toran: false, patternBorder: false, monogram: false, monogramText: "", monogramStyle: "circle",
    fill: "classic", nameFont: "serif", photo: null, photoPlace: "front", photoShape: "arch", shloka: "", namesLocal: "",
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

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </label>
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
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<Form>(() => initial(props));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ key: string; blob: Blob; name: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

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
    const { customW: _w, customH: _h, unit: _u, photo, ...rest } = form;
    void _w; void _h; void _u;
    return {
      ...rest,
      ...(photo ? { photo } : {}),
      ...(form.size === "custom" ? { customWidthMm: customW, customHeightMm: customH } : {}),
    };
  }, [form, customW, customH]);
  const optionsKey = useMemo(() => JSON.stringify(options), [options]);

  const chosen = props.events.filter((e) => form.eventIds.includes(e.id));
  const details = form.qr || !!form.rsvp.trim() || !!form.compliments.trim() || !!form.note.trim() || (form.replyBy && props.hasDeadline);
  const separate = form.eventLayout === "separate";
  const backPhoto = !!form.photo && form.photoPlace === "back";
  const pages = 1 + ((!separate && chosen.length) || details || backPhoto ? 1 : 0) + (separate ? chosen.length : 0);
  const [tw, th] = customOk ? trimSize(options) : [0, 0];
  const palette = paletteFor(props.theme, form.colours);
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

  // page 2: redraw the preview a moment after the last change
  useEffect(() => {
    if (!open || step !== 2 || !customOk || preview?.key === optionsKey) return;
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
  }, [open, step, optionsKey, customOk]);

  function remember() {
    try {
      localStorage.setItem(storeKey(props.weddingId), JSON.stringify(form));
    } catch {
      try { localStorage.setItem(storeKey(props.weddingId), JSON.stringify({ ...form, photo: null })); } catch { /* fine */ }
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 p-4 backdrop-blur-sm" role="dialog" aria-modal aria-labelledby="print-title">
      <div className={`max-h-[92vh] w-full overflow-y-auto rounded-2xl bg-[#fcfbf9] p-6 shadow-2xl md:p-8 ${step === 2 ? "max-w-5xl" : "max-w-2xl"}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="portal-eyebrow">Printed cards · step {step} of 2</p>
            <h2 id="print-title" className="mt-1 text-xl font-semibold tracking-tight">Download invitation PDF to print</h2>
            <p className="mt-1 text-sm text-neutral-500">
              {step === 1 ? "What to print and how." : "Make it yours — the preview shows the PDF exactly as it will print."}
            </p>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="portal-icon-button" aria-label="Close">×</button>
        </div>

        {step === 1 ? (
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
              <p className="mt-1 text-xs text-neutral-500">Printed as typed — in English, or in Hindi, Marathi or Sanskrit (Devanagari).</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-xs text-neutral-600">Invocation at the top (optional)</span>
                  <input value={form.invocation} onChange={(e) => set("invocation", e.target.value)} maxLength={80} placeholder="|| Shree Ganeshaya Namah ||  or  ॥ श्री गणेशाय नमः ॥" className="portal-input mt-1" />
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
                  <textarea value={form.rsvp} onChange={(e) => set("rsvp", e.target.value)} maxLength={240} rows={2} placeholder={"Rajesh Kosambi +91 98220 12345\nSonu +91 98765 43210"} className="portal-input mt-1 resize-none" />
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
                <Check checked={form.qr} onChange={(v) => set("qr", v)}>QR code to the wedding website</Check>
                <Check checked={form.dressCode} onChange={(v) => set("dressCode", v)}>Dress codes</Check>
                {props.hasDeadline && <Check checked={form.replyBy} onChange={(v) => set("replyBy", v)}>“Kindly reply by” date</Check>}
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
                <div className="mt-2"><Check checked={form.cropMarks} onChange={(v) => set("cropMarks", v)}>Add crop marks (only if your printer asks for them)</Check></div>
              )}
              <p className="mt-4 text-xs text-neutral-500">Colours</p>
              <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                <Choice name="colours" value="theme" current={form.colours} onPick={(v) => set("colours", v)} title="Your website's colours" hint="Full-colour card in your theme" />
                <Choice name="colours" value="light" current={form.colours} onPick={(v) => set("colours", v)} title="White card, coloured ink" hint="Cheaper; best for home printing" />
              </div>
            </fieldset>
          </div>
        ) : (
          <div className="mt-6 grid gap-8 text-sm md:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-7">
              <p className="rounded-lg bg-white px-3 py-2 text-xs text-neutral-600 ring-1 ring-neutral-200">
                Your theme&apos;s motifs — the ornament, dividers and corners from your website — are on every card.
              </p>

              {/* frame and ornaments */}
              <fieldset>
                <legend className={label}>Frame and ornaments</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Choice name="frame" value="classic" current={form.frame} onPick={(v) => set("frame", v)} title="Classic frame" hint="A fine double rule" />
                  <Choice name="frame" value="arch" current={form.frame} onPick={(v) => set("frame", v)} title="Arch frame" hint="Names inside a temple arch (mehrab)" />
                </div>
                <div className="mt-3 space-y-2">
                  <Check checked={form.toran} onChange={(v) => set("toran", v)}>Toran across the top <span className="text-xs text-neutral-500">— mango leaves and marigolds</span></Check>
                  <Check checked={form.patternBorder} onChange={(v) => set("patternBorder", v)}>Patterned border <span className="text-xs text-neutral-500">— a block-printed band round the edge</span></Check>
                </div>
              </fieldset>

              {/* monogram */}
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

              {/* type */}
              <fieldset>
                <legend className={label}>Lettering</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Choice name="fill" value="classic" current={form.fill} onPick={(v) => set("fill", v)} title="Classic spacing" hint="Airy, with room around the words" />
                  <Choice name="fill" value="fuller" current={form.fill} onPick={(v) => set("fill", v)} title="Fill the card" hint="Larger lettering that uses the space" />
                  <Choice name="names" value="serif" current={form.nameFont} onPick={(v) => set("nameFont", v)} title="Names in serif" hint="Tall classic capitals" />
                  <Choice name="names" value="script" current={form.nameFont} onPick={(v) => set("nameFont", v)} title="Names in script" hint="Flowing calligraphy" />
                </div>
              </fieldset>

              {/* photo */}
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

              {/* Indian languages */}
              <fieldset>
                <legend className={label}>Hindi, Marathi or Sanskrit</legend>
                <div className="mt-2 grid gap-3">
                  <label className="block">
                    <span className="text-xs text-neutral-600">Blessing or shloka under the invocation (optional)</span>
                    <textarea value={form.shloka} onChange={(e) => set("shloka", e.target.value)} maxLength={200} rows={2}
                      placeholder={"वक्रतुण्ड महाकाय सूर्यकोटि समप्रभ ।\nनिर्विघ्नं कुरु मे देव सर्वकार्येषु सर्वदा ॥"} className="portal-input mt-1 resize-none" />
                  </label>
                  <label className="block">
                    <span className="text-xs text-neutral-600">Your names in Hindi or Marathi, under the names (optional)</span>
                    <input value={form.namesLocal} onChange={(e) => set("namesLocal", e.target.value)} maxLength={80} placeholder="पूजा • स्पंदन" className="portal-input mt-1" />
                  </label>
                  <p className="text-xs text-neutral-500">Type with your phone&apos;s Hindi/Marathi keyboard, or paste. Any wording on step 1 can be in Devanagari too.</p>
                </div>
              </fieldset>
            </div>

            <aside className="md:sticky md:top-0 md:self-start" aria-label="Preview">
              <div className="flex items-center justify-between">
                <p className={label}>Preview</p>
                <span className="text-xs text-neutral-500" role="status" data-testid="preview-status">
                  {previewing ? "Updating…" : preview?.key === optionsKey ? "Up to date" : ""}
                </span>
              </div>
              <div className={`mt-3 max-h-[64vh] overflow-y-auto rounded-xl bg-neutral-100 p-4 transition-opacity ${previewing ? "opacity-60" : ""}`}>
                {!preview && <p className="py-16 text-center text-xs text-neutral-500">Drawing your cards…</p>}
                <PdfPages pdf={preview?.blob ?? null} />
              </div>
            </aside>
          </div>
        )}

        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-5">
          <p className="text-xs text-neutral-500" data-testid="print-summary">{summary}</p>
          <div className="flex gap-2">
            {step === 1 ? (
              <>
                <button type="button" onClick={() => setOpen(false)} className="portal-button-secondary">Close</button>
                <button type="button" onClick={() => { remember(); setStep(2); }} disabled={!customOk} className="portal-button">Next: design →</button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setStep(1)} className="portal-button-secondary">← Back</button>
                <button type="button" onClick={download} disabled={busy || !customOk} className="portal-button">
                  {busy ? "Making PDF…" : "Download PDF"}
                </button>
              </>
            )}
          </div>
        </div>
        {done && <p className="mt-3 text-right text-xs text-emerald-700" role="status">Downloaded {done}. Change anything to make another version.</p>}
        {error && <p className="mt-3 text-right text-xs text-red-700" role="alert">{error}</p>}
      </div>
    </div>
  );
}
