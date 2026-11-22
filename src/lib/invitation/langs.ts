/* The languages printed cards come in (browser-safe; the wording lives in i18n.ts). */

export const CARD_LANGS = [
  { id: "en", label: "English", native: "English" },
  { id: "gu", label: "Gujarati", native: "ગુજરાતી" },
  { id: "hi", label: "Hindi", native: "हिन्दी" },
] as const;
export type CardLang = (typeof CARD_LANGS)[number]["id"];
export type OtherLang = Exclude<CardLang, "en">;
export const isCardLang = (v: unknown): v is CardLang => CARD_LANGS.some((l) => l.id === v);
export const langLabel = (l: CardLang) => CARD_LANGS.find((x) => x.id === l)!.label;
export const langNative = (l: CardLang) => CARD_LANGS.find((x) => x.id === l)!.native;
