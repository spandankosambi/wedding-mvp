"use client";

import { useState } from "react";
import { transliterate } from "@/lib/invitation/translit";

/*
 * Our own on-screen keyboard for Gujarati and Hindi, for people whose phone
 * or laptop has no keyboard for the script. Keys type into whichever box was
 * last clicked. Gujarati letters sit 0x180 after their Devanagari twins, so
 * one Gujarati layout makes both.
 */

type Lang = "gu" | "hi";

const GU = {
  vowels: "અ આ ઇ ઈ ઉ ઊ ઋ એ ઐ ઓ ઔ",
  signs: "ા િ ી ુ ૂ ૃ ે ૈ ો ૌ ં ઃ ્ ઁ",
  consonants: "ક ખ ગ ઘ ઙ ચ છ જ ઝ ઞ ટ ઠ ડ ઢ ણ ત થ દ ધ ન પ ફ બ ભ મ ય ર લ વ ળ શ ષ સ હ",
  joined: "ક્ષ જ્ઞ શ્ર ત્ર દ્ધ દ્વ સ્ત સ્વ",
  digits: "૦ ૧ ૨ ૩ ૪ ૫ ૬ ૭ ૮ ૯",
  marks: "। ॥ , . : - ( ) &",
};

/** Gujarati → Devanagari, letter by letter (punctuation stays). */
const toDeva = (s: string) =>
  Array.from(s).map((ch) => {
    const cp = ch.codePointAt(0)!;
    return cp >= 0x0a81 && cp <= 0x0aef ? String.fromCodePoint(cp - 0x180) : ch;
  }).join("");

const keys = (row: string, lang: Lang) => row.split(" ").map((k) => (lang === "hi" ? toDeva(k) : k));
/** a vowel sign shown on a dotted circle so it can be seen on its own */
const shown = (k: string) => (/^[ऀ-ःा-्ઁ-ઃા-્]$/.test(k) ? `◌${k}` : k);

export function IndicKeyboard({ lang, target, onClose }: {
  lang: Lang;
  /** the box keys type into (the last one clicked) */
  target: () => HTMLInputElement | HTMLTextAreaElement | null;
  onClose: () => void;
}) {
  const [roman, setRoman] = useState("");
  const script = lang === "gu" ? "gujr" : "deva";
  const name = lang === "gu" ? "Gujarati" : "Hindi";

  /** put text at the caret (or replace the selection), as typing would */
  function type(text: string) {
    const el = target();
    if (!el) return;
    const start = el.selectionStart ?? el.value.length, end = el.selectionEnd ?? el.value.length;
    el.setRangeText(text, start, end, "end");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
  }
  function backspace() {
    const el = target();
    if (!el) return;
    const start = el.selectionStart ?? el.value.length, end = el.selectionEnd ?? el.value.length;
    if (start !== end) el.setRangeText("", start, end, "end");
    else if (start > 0) {
      // one character, not a whole joined letter: what a keyboard's ⌫ does
      const before = Array.from(el.value.slice(0, start));
      before.pop();
      const s = before.join("").length;
      el.setRangeText("", s, start, "end");
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
  }

  const key = (k: string, wide = false) => (
    <button
      key={k}
      type="button"
      // keep the cursor in the box being typed into
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => type(k)}
      className={`indic-key ${wide ? "px-3" : ""}`}
      aria-label={`Type ${k}`}
    >
      {shown(k)}
    </button>
  );
  const row = (r: string, label: string) => (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={label}>
      {keys(r, lang).map((k) => key(k))}
    </div>
  );
  const spelled = roman.trim() ? transliterate(roman, script) : "";

  return (
    <div className="indic-keyboard" role="group" aria-label={`${name} keyboard`} data-testid="indic-keyboard">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-neutral-700">{name} keyboard <span className="font-normal text-neutral-500">· types into the box you last clicked</span></p>
        <button type="button" onClick={onClose} className="portal-icon-button rounded-lg text-sm" aria-label="Close the keyboard">×</button>
      </div>
      <div className="indic-script space-y-1" lang={lang}>
        <div className="flex flex-wrap gap-x-3 gap-y-1">{row(GU.vowels, "Vowels")}{row(GU.signs, "Vowel signs")}</div>
        {row(GU.consonants, "Letters")}
        <div className="flex flex-wrap gap-x-3 gap-y-1">{row(GU.joined, "Joined letters")}{row(GU.digits, "Numbers")}</div>
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Marks">
          {keys(GU.marks, lang).map((k) => key(k))}
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => type(" ")} className="indic-key min-w-[7rem]" aria-label="Space">space</button>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={backspace} className="indic-key px-3" aria-label="Delete the letter before the cursor">⌫</button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-neutral-200 pt-2">
        <label className="text-[11px] text-neutral-500" htmlFor="roman-input">Or type it in English letters</label>
        <input
          id="roman-input"
          value={roman}
          onChange={(e) => setRoman(e.target.value)}
          placeholder={lang === "gu" ? "e.g. Pooja" : "e.g. Spandan"}
          className="portal-input !w-40 !py-1"
          aria-label="Type a word in English letters"
        />
        <span className="indic-script min-w-[5rem] text-base" lang={lang} data-testid="spelled">{spelled || "…"}</span>
        <button
          type="button"
          disabled={!spelled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { type(spelled); setRoman(""); }}
          className="portal-button-secondary py-1"
        >
          Insert
        </button>
      </div>
    </div>
  );
}
