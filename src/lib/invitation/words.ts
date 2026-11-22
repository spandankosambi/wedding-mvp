import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { weddings, events } from "@/db/schema";
import { getLook, withLook, wordingOf, type FamilySide } from "@/lib/looks";
import { eventForSide } from "@/lib/sides";
import { invitationSchema } from "./options";
import { type CardField } from "./i18n";
import { localizeCards } from "./machine";
import type { OtherLang } from "./langs";

/**
 * Every line a family's printed cards could carry, in a language, with our
 * draft and the family's own words — for the Card wording page. Built with
 * everything switched on (each celebration of theirs, event cards, reply-by,
 * dress codes, all the wording) so an edit is there whatever they print.
 */
export async function cardWords(weddingId: string, family: FamilySide, lang: OtherLang): Promise<{ fields: CardField[]; mine: Record<string, string> } | null> {
  const [wedding] = await db.select().from(weddings).where(eq(weddings.id, weddingId));
  if (!wedding) return null;
  const [look, evs] = await Promise.all([
    getLook(weddingId, family),
    db.select().from(events).where(eq(events.weddingId, weddingId)),
  ]);
  const w = wordingOf(look);
  const o = invitationSchema.parse({
    version: family, eventLayout: "separate", replyBy: true, dressCode: true, qr: true,
    eventIds: evs.filter((e) => eventForSide(e.side, family)).map((e) => e.id),
  });
  const opts = {
    ...o,
    invocation: look.invocation ?? "", shloka: look.shloka ?? "", note: look.closingLine ?? "",
    rsvpBride: w.rsvpContacts ?? "", rsvpGroom: w.rsvpContacts ?? "",
    complimentsBride: look.compliments ?? "", complimentsGroom: look.compliments ?? "",
  };
  const { fields } = await localizeCards(withLook(wedding, look), evs, opts, "https://onetapinvites.com", lang);
  // the event cards' "and" between the names isn't a field; the together layout's lines are the same keys
  return { fields, mine: look.printText?.[lang] ?? {} };
}
