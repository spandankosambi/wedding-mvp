"use client";

import { sideNamesOf } from "@/lib/site/side-names";
import { CARD_LANGS, langLabel, langNative, type CardLang } from "@/lib/invitation/langs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { adoptCardWordingAction, savePrintConfigAction } from "../actions";
import { BLEED_MM, CARD_SIZES, CUSTOM_MAX_MM, CUSTOM_MIN_MM, MM_PER_INCH, MONOGRAM_STYLES, cardPrintLine, defaultMonogram, foldedSheet, isPortrait, paperName, trimSize, type MonogramStyle, type SizeId, type Omittable } from "@/lib/invitation/options";
import { envelopeFor, flatSheet } from "@/lib/invitation/envelope";
import { crest, paletteFor } from "@/lib/invitation/motifs";
import {
  BORDER_STYLES, BORDER_LABELS, PATTERNS, PATTERN_LABELS, SYMBOLS, SYMBOL_LABELS, SYMBOL_GLYPHS, isGlyph,
  backgroundPattern, borderBand, symbol as symbolMotif, type DrawnSymbol,
} from "@/lib/invitation/decor";
import { MotifSvg as Art } from "@/components/MotifSvg";
import { MaskCanvas, maskFromFile } from "@/components/MaskUpload";

import {
  SHARED_KEYS, WORDING_LABELS, fromSaved, initial, legacyKey, oldWording, oldWordingKey, readSaved, storeKey,
  type CardWording, type Form, type Props, type SentOptions,
} from "./form";
import { Check, Choice, PaletteMotif, Thumb, label } from "./controls";
import { shrinkPhoto } from "./photo";
import { PdfPages } from "./PdfPreview";
import { PrintPress } from "./PrintPress";

const STEPS = ["Setup", "Design"] as const;
type Step = 1 | 2;

export function PrintInvitation(props: Props) {
  const names = sideNamesOf(props); // "Pooja", "Spandan"
  const [step, setStep] = useState<Step>(1);
  const [symbolError, setSymbolError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(() => initial(props));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [press, setPress] = useState<{ image: string | null } | null>(null);
  const closePress = useCallback(() => setPress(null), []);
  const [preview, setPreview] = useState<{ key: string; blob: Blob; name: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // answers are remembered on this device for the next print
  const router = useRouter();
  const [moved, setMoved] = useState<CardWording | null>(null);
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    const local = readSaved(storeKey(props.weddingId, props.family)) ?? readSaved(legacyKey(props.weddingId));
    // the saved configuration wins; the photo is only ever kept on this device
    const saved = props.savedConfig ? { ...props.savedConfig, photo: local?.photo ?? null } : local;
    // wording typed here before it moved to the site: offer to move it
    const kept = readSaved(oldWordingKey(props.weddingId, props.family)) as CardWording | null;
    const old = kept ?? (local ? oldWording(local, props.family) : null);
    if (old) {
      try { localStorage.setItem(oldWordingKey(props.weddingId, props.family), JSON.stringify(old)); } catch { /* fine */ }
      setMoved(old);
    }
    if (saved) {
      const known = new Set(props.events.map((e) => e.id));
      setForm((f) => {
        const next = fromSaved(f, saved);
        // "Print on envelopes" was retired: a saved one becomes the cut-and-fold envelope
        if ((next.envelope as string) === "front") next.envelope = "flat";
        // always this family's card
        return { ...next, version: props.family, eventIds: next.eventIds.filter((id) => known.has(id)) };
      });
    }
    setPartnerSaved(!!props.partnerConfig || !!readSaved(storeKey(props.weddingId, props.family === "bride" ? "groom" : "bride")));
  }, [props.weddingId, props.events, props.family, props.savedConfig, props.partnerConfig]);

  const [partnerSaved, setPartnerSaved] = useState(false);
  function copyPartner() {
    const other = props.partnerConfig ?? readSaved(storeKey(props.weddingId, props.family === "bride" ? "groom" : "bride"));
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
  // a folded card is portrait (or square) panels side by side: landscape ones open too long and narrow
  const landscape = !square && form.orientation === "landscape";
  useEffect(() => {
    if (landscape && form.eventLayout === "folded") setForm((f) => ({ ...f, eventLayout: "together" }));
  }, [landscape, form.eventLayout]);

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
  const optionsKey = useMemo(() => JSON.stringify({ options, wording: props.wording, icons: props.icons }), [options, props.wording, props.icons]);

  const chosen = props.events.filter((e) => form.eventIds.includes(e.id));
  const prints = (k: Omittable) => !form.omit.includes(k);
  const hasParents = !!(props.brideParents?.trim() || props.groomParents?.trim());
  const toggleOmit = (k: Omittable) => setForm((f) => ({ ...f, omit: f.omit.includes(k) ? f.omit.filter((x) => x !== k) : [...f.omit, k] }));
  const details = form.qr || (prints("rsvpContacts") && !!props.wording.rsvpContacts) || (prints("compliments") && !!props.wording.compliments)
    || (prints("closingLine") && !!props.wording.closingLine) || (form.replyBy && props.hasDeadline);
  const separate = form.eventLayout === "separate";
  const backPhoto = !!form.photo && form.photoPlace === "back";
  const folded = form.eventLayout === "folded";
  const pages = folded ? 2 : 1 + ((!separate && chosen.length) || details || backPhoto ? 1 : 0) + (separate ? chosen.length : 0);
  const [tw, th] = customOk ? trimSize(options) : [0, 0];
  const [ow, oh] = customOk ? foldedSheet(options) : [0, 0];
  const palette = paletteFor(props.theme, form.colours);
  const portrait = customOk && isPortrait(options);
  const monoDefault = defaultMonogram(props.brideName, props.groomName, form.version);

  async function makePdf(part: "all" | "card" | "envelope" = "all"): Promise<{ blob: Blob; name: string }> {
    const res = await fetch("/couple/invitation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weddingId: props.admin ? props.weddingId : undefined, options, part }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "failed");
    const blob = await res.blob();
    const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "invitation.pdf";
    return { blob, name };
  }

  // redraw the preview a moment after the last change, on every page
  useEffect(() => {
    if (!customOk || preview?.key === optionsKey) return;
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
  }, [optionsKey, customOk]);

  function remember() {
    try {
      localStorage.setItem(storeKey(props.weddingId, props.family), JSON.stringify(form));
    } catch {
      try { localStorage.setItem(storeKey(props.weddingId, props.family), JSON.stringify({ ...form, photo: null })); } catch { /* fine */ }
    }
  }

  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  async function saveConfig() {
    setSaving(true); setError(null); setSavedNote(null); setDone(null);
    remember();
    try {
      const r = await savePrintConfigAction({ weddingId: props.admin ? props.weddingId : undefined, family: props.family, config: form });
      if (r.ok) setSavedNote(form.photo ? "Saved. Your choices will be here next time, on any device. The photo is kept on this device only." : "Saved. Your choices will be here next time, on any device.");
      else setError("Couldn't save the configuration. Please try again.");
    } catch { setError("Couldn't save the configuration. Please try again."); }
    setSaving(false);
  }

  async function download() {
    setBusy(true); setError(null); setDone(null);
    remember();
    // the press prints the card they designed: the preview's first page
    const first = document.querySelector<HTMLCanvasElement>('[data-testid="pdf-preview"] canvas');
    let image: string | null = null;
    try { image = first ? first.toDataURL("image/png") : null; } catch { /* drawn without it */ }
    setPress({ image });
    try {
      const save = (made: { blob: Blob; name: string }) => {
        const url = URL.createObjectURL(made.blob);
        const a = document.createElement("a");
        a.href = url; a.download = made.name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      };
      if (form.envelope === "none") {
        const made = preview?.key === optionsKey ? preview : await makePdf("card");
        save(made);
        setDone(made.name);
      } else {
        // two files: the cards, and the envelope on its own sheet
        const [card, env] = await Promise.all([makePdf("card"), makePdf("envelope")]);
        save(card);
        setTimeout(() => save(env), 400); // a moment apart, so the browser keeps both
        setDone(`${card.name} and ${env.name}`);
      }
    } catch (e) {
      setPress(null);
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

  // the paper the cut-and-fold envelope prints on, e.g. "A3 (297 × 420 mm)"
  // how to print, in plain words: the invitation, then the envelope
  const hasBack = folded || !!((!separate && chosen.length) || details || backPhoto);
  const envSheet = customOk ? flatSheet(envelopeFor({ size: form.size, orientation: form.orientation, customWidthMm: customW, customHeightMm: customH, eventLayout: form.eventLayout }).mm) : null;
  const printSteps = customOk
    ? [
        cardPrintLine(options, hasBack, separate ? chosen.length : 0),
        ...(form.envelope !== "none" && envSheet
          ? [`Print the envelope on ${envSheet.name === "custom" ? `a ${envSheet.mm[0]} × ${envSheet.mm[1]} mm sheet of` : envSheet.name} paper`]
          : []),
      ]
    : [];
  const summary = customOk
    ? folded
      ? `Folded card · 2 pages · ${paperName([ow, oh])} folded in half${chosen.length === 0 ? " · no events selected" : ""}`
      : `${pages} ${pages === 1 ? "page" : "pages"} · ${paperName([tw, th])} card${chosen.length === 0 ? " · no events selected" : ""}`
    : "Enter a custom size";

  const go = (to: Step) => { remember(); setStep(to); };

  return (
    <section id="print-options" data-testid="print-page" aria-label="Print invitation cards">
      <div className="portal-panel !overflow-visible p-5 md:p-7">

        {/* the three pages, also clickable */}
        <ol className="flex flex-wrap gap-2 text-xs" aria-label="Steps">
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

        <div className="mt-6 grid gap-8 text-sm lg:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
          <div className="space-y-7">
            {step === 1 && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white px-3 py-2.5 text-xs ring-1 ring-neutral-200">
                  <p className="text-neutral-600">
                    <span className="font-medium text-neutral-800">{names[props.family]}&apos;s family&apos;s</span> card — hosted by their parents, with the common events and their own.
                  </p>
                  {partnerSaved && (
                    <button type="button" onClick={copyPartner} className="portal-button-secondary">
                      Same as {names[props.family === "bride" ? "groom" : "bride"]}&apos;s family&apos;s card
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
                  <p className="mt-1 text-neutral-500">Untick anything you don&apos;t want printed on this card. Your website keeps it.</p>
                  <ul className="mt-2 space-y-1.5">
                    {(Object.keys(WORDING_LABELS) as (keyof CardWording)[]).map((k) => (
                      <li key={k}>
                        <label className={`grid grid-cols-[auto_minmax(0,2fr)_minmax(0,3fr)] items-start gap-x-2.5 ${props.wording[k] ? "cursor-pointer" : ""}`}>
                          <input type="checkbox" className="mt-0.5 h-3.5 w-3.5" aria-label={`Print: ${WORDING_LABELS[k]}`}
                            checked={!!props.wording[k] && prints(k)} disabled={!props.wording[k]} onChange={() => toggleOmit(k)} />
                          <span className="text-neutral-500">{WORDING_LABELS[k]}</span>
                          <span className={!props.wording[k] ? "italic text-neutral-400" : prints(k) ? "whitespace-pre-line text-neutral-800" : "whitespace-pre-line text-neutral-400 line-through"}>{props.wording[k] ?? "not set"}</span>
                        </label>
                      </li>
                    ))}
                    <li>
                      <div className="grid grid-cols-[auto_minmax(0,2fr)_minmax(0,3fr)] items-start gap-x-2.5">
                        <input type="checkbox" id="print-parents" className="mt-0.5 h-3.5 w-3.5" aria-label="Print: Parents"
                          checked={hasParents && prints("parents")} disabled={!hasParents} onChange={() => toggleOmit("parents")} />
                        <label htmlFor="print-parents" className="text-neutral-500">Parents</label>
                        <span className="text-neutral-800">
                          {hasParents
                            ? <span className={prints("parents") ? "" : "text-neutral-400 line-through"}>{[props.brideParents, props.groomParents].filter(Boolean).join(" · ")}</span>
                            : <span className="italic text-neutral-400">not set — “The family of …” prints instead</span>}
                          {hasParents && !prints("parents") && <span className="italic text-neutral-500"> “The family of …” prints instead.</span>}
                          {" "}<a href={props.siteEditorHref} className="text-neutral-500 underline">on the dashboard</a>
                        </span>
                      </div>
                    </li>
                  </ul>
                </div>

                <fieldset data-testid="card-language">
                  <legend className={label}>Language on the card</legend>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <select
                      aria-label="Language on the card"
                      value={form.lang}
                      onChange={(e) => set("lang", e.target.value as CardLang)}
                      className="portal-input w-auto min-w-[12rem]"
                    >
                      {CARD_LANGS.map((l) => (
                        <option key={l.id} value={l.id}>{l.id === "en" ? "English" : `${l.label} · ${l.native}`}</option>
                      ))}
                    </select>
                    {form.lang === "en" && <span className="text-xs text-neutral-500">Also in Gujarati and Hindi, for the printed cards only.</span>}
                  </div>
                  {form.lang !== "en" && (
                    <div className="mt-3 rounded-lg bg-[#fdf6f2] px-3 py-3 text-xs ring-1 ring-[#f1d8cc]" data-testid="language-note">
                      <p className="text-neutral-700">
                        We&apos;ve put every line of the card into <b>{langLabel(form.lang)}</b>: the usual invitation phrases,
                        dates and times, and names and places spelled out in {langNative(form.lang)}. Names are a first draft:
                        check them before printing. Your edits are used <b>only on the printed cards</b>, never on your website.
                      </p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-3">
                        <a
                          href={`${props.wordsHref}&lang=${form.lang}`}
                          onClick={remember}
                          className="portal-button"
                          data-testid="edit-card-words"
                        >
                          Check and edit the {langLabel(form.lang)} wording →
                        </a>
                        {!!props.editedCounts?.[form.lang] && (
                          <span className="text-neutral-500">{props.editedCounts[form.lang]} line{props.editedCounts[form.lang] === 1 ? "" : "s"} in your own words</span>
                        )}
                      </div>
                    </div>
                  )}
                </fieldset>

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
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <Choice name="layout" value="together" current={form.eventLayout} onPick={(v) => set("eventLayout", v)} title="On the back of the card" hint="Invitation on the front, all events listed on the back" />
                    <Choice name="layout" value="separate" current={form.eventLayout} onPick={(v) => set("eventLayout", v)} title="A separate card for each event" hint="Invitation card plus one insert card per event" />
                    <Choice name="layout" value="folded" current={form.eventLayout} onPick={(v) => set("eventLayout", v)} title="A folded card" disabled={landscape}
                      hint={landscape
                        ? "Portrait cards only. Folded side by side, a landscape card opens into a long, narrow strip that doesn't fit standard paper or envelopes. Switch the orientation to portrait to use it."
                        : "One sheet folded in half: a cover with To and From outside, the invitation and events inside"} />
                  </div>
                  {form.eventLayout === "folded" && (
                    <p className="mt-2 text-xs text-neutral-500" data-testid="fold-note">
                      The card size you pick is the open sheet, and each half is half of it: an A4 sheet folds to A5, a 5 × 7 in to 3½ × 5 in.
                      Print both pages on one sheet, double-sided
                      (choose &ldquo;flip on short edge&rdquo;), then fold down the middle: the crest is the back, the To and From cover the front.
                    </p>
                  )}
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
                    {SYMBOLS.filter((sy) => sy !== "custom").map((sy) => (
                      <Thumb key={sy} label={SYMBOL_LABELS[sy]} on={form.symbol === sy} bg={palette.bg} onPick={() => set("symbol", sy)}>
                        {sy === "motif" ? <span className="grid h-[44px] w-[44px] place-items-center text-lg" style={{ color: palette.hair }}>—</span>
                          : isGlyph(sy) ? <span className={`${SYMBOL_GLYPHS[sy].css} grid h-[44px] w-[44px] place-items-center text-3xl leading-none`} style={{ color: palette.accent }}>{SYMBOL_GLYPHS[sy].text}</span>
                          : <Art m={symbolMotif(sy as DrawnSymbol)} colours={palette} width={44} />}
                      </Thumb>
                    ))}
                    {form.symbolImage && (
                      <Thumb label="Your own" on={form.symbol === "custom"} bg={palette.bg} onPick={() => set("symbol", "custom")}>
                        <MaskCanvas mask={form.symbolImage} colour={palette.accent} size={44} />
                      </Thumb>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-800">PRO</span>
                    <label className="cursor-pointer font-medium text-stone-800 underline underline-offset-2">
                      {form.symbolImage ? "Replace your own symbol" : "Upload your own symbol"}
                      <input type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp" className="sr-only" aria-label="Upload your own symbol"
                        onChange={async (e) => {
                          const input = e.currentTarget, r = await maskFromFile(input.files?.[0]);
                          input.value = "";
                          setSymbolError(r.error ?? null);
                          if (r.mask) setForm((f) => ({ ...f, symbol: "custom", symbolImage: r.mask! }));
                        }} />
                    </label>
                    {form.symbolImage && (
                      <button type="button" className="text-neutral-500 underline underline-offset-2 hover:text-red-700"
                        onClick={() => setForm((f) => ({ ...f, symbolImage: "", symbol: f.symbol === "custom" ? "motif" : f.symbol }))}>
                        Remove it
                      </button>
                    )}
                    <span className="text-neutral-500">Any symbol or emblem as an SVG or PNG, one colour on a plain or transparent background. It prints in the card&apos;s colour.</span>
                  </div>
                  {symbolError && <p className="mt-1 text-xs text-red-700" role="alert">{symbolError}</p>}
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
                                <PaletteMotif m={cr} p={palette} size={64} text={form.monogramText || monoDefault} textY={cr.textY} textSize={cr.textSize} />
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
                  <legend className={label}>Envelope</legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <Choice name="envelope" value="none" current={form.envelope} onPick={(v) => set("envelope", v)} title="No envelope" />
                    <Choice name="envelope" value="flat" current={form.envelope} onPick={(v) => set("envelope", v)} title="Cut-and-fold" hint="A sheet in your design to cut out and fold" />
                  </div>
                  {form.envelope !== "none" && (() => {
                    const env = envelopeFor({ size: form.size, orientation: form.orientation, customWidthMm: customW, customHeightMm: customH, eventLayout: form.eventLayout });
                    const sheet = flatSheet(env.mm);
                    return (
                      <p className="mt-2 text-xs text-neutral-500" data-testid="envelope-note">
                        Makes a <b>{env.name}</b> envelope. Print it on <b data-testid="envelope-paper">{sheet.name === "custom" ? `a ${sheet.mm[0]} × ${sheet.mm[1]} mm sheet of` : sheet.name}</b> paper
                        {sheet.name === "A4" ? " (any home printer)" : sheet.name === "A3" ? " (most print shops do A3)" : " (at a print shop)"}, cut along the solid line and fold along the dashes.
                        Your monogram seal sits on the flap. Download PDF gives you two files: the cards, and the envelope.
                      </p>
                    );
                  })()}
                </fieldset>

                <fieldset>
                  <legend className={label}>Also on the card</legend>
                  <div className="mt-2 space-y-2">
                    <Check checked={form.qr} onChange={(v) => set("qr", v)}>QR code to the wedding website <span className="text-xs text-neutral-500">— on the back, for guests to RSVP</span></Check>
                    {props.icons ? (
                      <Check checked={form.cardIcons} onChange={(v) => set("cardIcons", v)}>Celebration icons <span className="text-xs text-neutral-500">— beside each event. Unticking removes them from the printed cards only, not your website.</span></Check>
                    ) : (
                      <p className="text-xs text-neutral-500">
                        Celebration icons are off — <a href={props.wordingHref.replace("#wording", "#decor")} className="underline">turn them on under Design touches</a> to add them to your site and cards.
                      </p>
                    )}
                    <Check checked={form.dressCode} onChange={(v) => set("dressCode", v)}>Dress codes <span className="text-xs text-neutral-500">— under each celebration</span></Check>
                    {props.hasDeadline && <Check checked={form.replyBy} onChange={(v) => set("replyBy", v)}>“Kindly reply by” date</Check>}
                  </div>
                </fieldset>
              </>
            )}
          </div>

          <aside id="print-preview" className="lg:sticky lg:top-20 lg:self-start" aria-label="Preview">
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
          <div>
            <p className="text-xs text-neutral-500" data-testid="print-summary">{summary}</p>
            {customOk && (
              <ul className="mt-1.5 inline-block list-disc rounded-lg bg-amber-50 py-1.5 pl-6 pr-3 text-xs text-stone-700 ring-1 ring-amber-200" data-testid="paper-sizes">
                {printSteps.map((s) => <li key={s}>{s}</li>)}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={saveConfig} disabled={saving || !customOk} className="portal-button-secondary">{saving ? "Saving…" : "Save configuration"}</button>
            {step > 1 && <button type="button" onClick={() => go((step - 1) as Step)} className="portal-button-secondary">← Back</button>}
            {step < 2 ? (
              <button type="button" onClick={() => go((step + 1) as Step)} disabled={!customOk} className="portal-button">
                Next: design →
              </button>
            ) : (
              <button type="button" onClick={download} disabled={busy || !customOk} className="portal-button" data-tour="download">
                {busy ? "Making PDF…" : "Download PDF"}
              </button>
            )}
          </div>
        </div>
        {savedNote && <p className="mt-3 text-right text-xs text-emerald-700" role="status">{savedNote}</p>}
        {done && <p className="mt-3 text-right text-xs text-emerald-700" role="status">Downloaded {done}. Change anything to make another version.</p>}
        {error && <p className="mt-3 text-right text-xs text-red-700" role="alert">{error}</p>}
        {press && customOk && (
          <PrintPress image={press.image} steps={printSteps} onClose={closePress} />
        )}
      </div>
    </section>
  );
}
