"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/authz";
import { allows } from "@/lib/access";
import { asFamilySide, getLook, updateLook } from "@/lib/looks";
import { cardWords } from "@/lib/invitation/words";
import { isCardLang } from "@/lib/invitation/langs";

/**
 * The Card wording page's Save: the family's own words for the printed cards
 * in one language. Only lines that differ from our draft are kept, so an
 * untouched line follows any later change on the site. Print only.
 */
export async function saveCardWordsAction(fd: FormData) {
  const family = asFamilySide(String(fd.get("family") ?? ""));
  const lang = String(fd.get("lang") ?? "");
  const staff = await requireRole(["committee", "couple", "admin"]);
  const weddingId = staff.role === "admin" ? String(fd.get("weddingId") ?? "") : staff.weddingId;
  if (!family || !weddingId || !z.string().uuid().safeParse(weddingId).success || !isCardLang(lang) || lang === "en") return;
  if (!allows(staff.access, "print", family, "full")) return;

  const words = await cardWords(weddingId, family, lang);
  if (!words) return;
  const auto = new Map(words.fields.map((f) => [f.key, f.auto]));
  const mine: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("w.") || typeof v !== "string") continue;
    const key = k.slice(2);
    if (!auto.has(key)) continue; // only lines the cards have
    const text = v.replace(/\r\n?/g, "\n").replace(/[ \t ]+/g, " ").trim().slice(0, 400);
    if (text && text !== auto.get(key)) mine[key] = text;
  }
  const look = await getLook(weddingId, family);
  await updateLook(weddingId, family, { printText: { ...(look.printText ?? {}), [lang]: mine } });
  revalidatePath(`/couple/${family}/print`, "layout");
}
