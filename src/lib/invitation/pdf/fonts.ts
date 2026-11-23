/* The fonts the cards use, bundled (SIL Open Font Licence) and registered once. */
import path from "node:path";
import { Font } from "@react-pdf/renderer";

/* ── fonts (bundled, SIL Open Font Licence) ───────────────────── */
const FONT_DIR = path.join(process.cwd(), "src/lib/invitation/fonts");
let fontsReady = false;
export function registerFonts() {
  if (fontsReady) return;
  const f = (name: string) => path.join(FONT_DIR, name);
  Font.register({
    family: "Cormorant",
    fonts: [
      { src: f("cormorant-garamond-latin-500-normal.woff"), fontWeight: 500 },
      { src: f("cormorant-garamond-latin-500-italic.woff"), fontWeight: 500, fontStyle: "italic" },
      { src: f("cormorant-garamond-latin-600-normal.woff"), fontWeight: 600 },
      { src: f("cormorant-garamond-latin-700-normal.woff"), fontWeight: 700 },
    ],
  });
  Font.register({
    family: "Cinzel",
    fonts: [
      { src: f("cinzel-latin-500-normal.woff"), fontWeight: 500 },
      { src: f("cinzel-latin-600-normal.woff"), fontWeight: 600 },
    ],
  });
  // a single-glyph symbol: Ik Onkar (Gurmukhi)
  Font.register({ family: "Gurmukhi", src: f("noto-serif-gurmukhi-gurmukhi-500-normal.woff") });
  // Devanagari (Hindi, Marathi, Sanskrit): one face, answering every weight
  const deva = f("tiro-devanagari-sanskrit-devanagari-400-normal.woff");
  const devaIt = f("tiro-devanagari-sanskrit-devanagari-400-italic.woff");
  Font.register({
    family: "Tiro",
    fonts: [400, 500, 600, 700].flatMap((fontWeight) => [
      { src: deva, fontWeight },
      { src: devaIt, fontWeight, fontStyle: "italic" as const },
    ]),
  });
  // Gujarati: Noto Serif Gujarati, every weight and slant answered
  const guj = (w: number) => f(`noto-serif-gujarati-gujarati-${w}-normal.woff`);
  Font.register({
    family: "Gujarati",
    fonts: ([[400, 400], [500, 400], [600, 600], [700, 700]] as const).flatMap(([fontWeight, file]) => [
      { src: guj(file), fontWeight },
      { src: guj(file), fontWeight, fontStyle: "italic" as const },
    ]),
  });
  Font.register({
    family: "GreatVibes",
    fonts: [400, 500, 600, 700].map((fontWeight) => ({ src: f("great-vibes-latin-400-normal.woff"), fontWeight })),
  });
  Font.registerHyphenationCallback((w) => [w]); // never split names
  fontsReady = true;
}
