import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { machineText } from "@/db/schema";
import type { OtherLang } from "./langs";
import { localize } from "./i18n";

/*
 * Azure Translator for the printed cards' own lines: names and blessings are
 * spelled out in the script (transliterate), addresses, venues, dress codes
 * and closing lines translated. Our phrases stay ours. Every result is kept
 * in machine_text, so a line costs the free allowance once. Without a key,
 * or when Azure fails, the built-in spelling rules are used.
 */

export type MachineKind = "name" | "text";
export type Machine = { get(kind: MachineKind, src: string): string | undefined };

const ENDPOINT = "https://api.cognitive.microsofttranslator.com";
const SCRIPT: Record<OtherLang, string> = { gu: "Gujr", hi: "Deva" };

export const machineOn = () => !!process.env.AZURE_TRANSLATOR_KEY;

/** A Machine that only notes what it was asked for (and answers nothing). */
export function recorder(): Machine & { asked: Map<MachineKind, Set<string>> } {
  const asked = new Map<MachineKind, Set<string>>([["name", new Set()], ["text", new Set()]]);
  return { asked, get(kind, src) { if (src.trim()) asked.get(kind)!.add(src); return undefined; } };
}

async function azure(kind: MachineKind, lang: OtherLang, items: string[]): Promise<string[]> {
  const url = kind === "name"
    ? `${ENDPOINT}/transliterate?api-version=3.0&language=${lang}&fromScript=Latn&toScript=${SCRIPT[lang]}`
    : `${ENDPOINT}/translate?api-version=3.0&from=en&to=${lang}&textType=plain`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": process.env.AZURE_TRANSLATOR_KEY!,
      "Ocp-Apim-Subscription-Region": process.env.AZURE_TRANSLATOR_REGION || "centralindia",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(items.map((Text) => ({ Text }))),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Azure Translator ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as Array<{ text?: string; translations?: { text: string }[] }>;
  return data.map((d, i) => (kind === "name" ? d.text : d.translations?.[0]?.text) ?? items[i]);
}

/** Batches within Azure's limits: up to 100 lines and ~9,000 characters a call. */
function batches(items: string[]) {
  const out: string[][] = [];
  let cur: string[] = [], size = 0;
  for (const s of items) {
    if (cur.length && (cur.length >= 100 || size + s.length > 9000)) { out.push(cur); cur = []; size = 0; }
    cur.push(s); size += s.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** The machine's words for the lines asked for: saved ones, then Azure for the rest. */
export async function machineFor(lang: OtherLang, asked: Map<MachineKind, Set<string>>): Promise<Machine | undefined> {
  if (!machineOn()) return undefined;
  const got = new Map<string, string>();
  const key = (kind: MachineKind, src: string) => `${kind}\u0000${src}`;
  try {
    for (const [kind, set] of asked) {
      const srcs = [...set].map((s) => s.trim()).filter(Boolean);
      if (!srcs.length) continue;
      const saved = await db.select().from(machineText)
        .where(and(eq(machineText.lang, lang), eq(machineText.kind, kind), inArray(machineText.src, srcs)));
      for (const r of saved) got.set(key(kind, r.src), r.out);
      const missing = srcs.filter((s) => !got.has(key(kind, s)));
      for (const batch of batches(missing)) {
        const outs = await azure(kind, lang, batch);
        const rows = batch.map((src, i) => ({ lang, kind, src, out: outs[i] })).filter((r) => r.out.trim());
        for (const r of rows) got.set(key(kind, r.src), r.out);
        if (rows.length) await db.insert(machineText).values(rows).onConflictDoNothing();
      }
    }
  } catch (e) {
    console.warn("[machine] falling back to our spelling rules:", e instanceof Error ? e.message : e);
  }
  return { get: (kind, src) => got.get(key(kind, src.trim())) };
}

/**
 * localize(), with Azure's words as the draft: a first pass notes the lines
 * that need the machine, they're fetched (or read back), then the real pass.
 */
export async function localizeCards(...args: Parameters<typeof localize>): Promise<ReturnType<typeof localize>> {
  const [w, all, o, siteUrl, lang, text = {}] = args;
  if (lang === "en" || !machineOn()) return localize(w, all, o, siteUrl, lang, text);
  const rec = recorder();
  localize(w, all, o, siteUrl, lang, text, rec);
  const mt = await machineFor(lang, rec.asked);
  return localize(w, all, o, siteUrl, lang, text, mt);
}
