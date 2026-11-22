import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { weddings, events } from "@/db/schema";
import { requireRole } from "@/lib/authz";
import { allows } from "@/lib/access";
import { sharePath } from "@/lib/share";
import { appOrigin } from "@/lib/origin";
import { invitationSchema } from "@/lib/invitation/options";
import { downloadName } from "@/lib/invitation/content";
import { envelopeFor, flatSheet } from "@/lib/invitation/envelope";
import { localizeCards } from "@/lib/invitation/machine";
import { renderInvitationPdf } from "@/lib/invitation/pdf";
import { getLook, withLook, wordingOf } from "@/lib/looks";
import { decorOf } from "@/lib/site-decor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The couple's printable invitation cards, as a PDF download. */
export async function POST(req: Request) {
  const staff = await requireRole(["committee", "couple", "admin"]);
  let body: { weddingId?: unknown; options?: unknown; part?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }
  const weddingId = staff.role === "admin" && typeof body.weddingId === "string" ? body.weddingId : staff.weddingId;
  if (!weddingId) return Response.json({ error: "no wedding" }, { status: 403 });

  const parsed = invitationSchema.safeParse(body.options ?? {});
  if (!parsed.success) return Response.json({ error: "invalid options" }, { status: 400 });

  // printing a family's cards needs print access on that family's side
  if (!allows(staff.access, "print", parsed.data.version, "full")) return Response.json({ error: "forbidden" }, { status: 403 });

  const [wedding] = await db.select().from(weddings).where(eq(weddings.id, weddingId));
  if (!wedding) return Response.json({ error: "no wedding" }, { status: 404 });
  // each family's cards in its own look, with its own wording and reply-by date
  const look = await getLook(weddingId, parsed.data.version);
  // wording unticked on the print page stays off this card
  const off = new Set(parsed.data.omit);
  const keep = (k: (typeof parsed.data.omit)[number], v: string | null | undefined) => (off.has(k) ? "" : v ?? "");
  const contacts = keep("rsvpContacts", wordingOf(look).rsvpContacts);
  const o = {
    ...parsed.data,
    icons: decorOf(look).icons && parsed.data.cardIcons, // on under Design touches, unless left off the cards
    invocation: keep("invocation", look.invocation), shloka: keep("shloka", look.shloka), note: keep("closingLine", look.closingLine),
    rsvpBride: contacts, rsvpGroom: contacts,
    complimentsBride: keep("compliments", look.compliments), complimentsGroom: keep("compliments", look.compliments),
  };
  // without the parents' names the card reads "The family of …"
  const card = off.has("parents") ? { ...wedding, brideParents: null, groomParents: null } : wedding;
  const evs = await db.select().from(events).where(eq(events.weddingId, weddingId));
  if (o.eventIds?.some((id) => !evs.some((e) => e.id === id))) {
    return Response.json({ error: "invalid events" }, { status: 400 });
  }

  // in Gujarati or Hindi: the family's words from the Card wording page, else our draft
  const words = o.lang === "en" ? {} : look.printText?.[o.lang] ?? {};
  const { inv } = await localizeCards(withLook(card, look), evs, o, `${await appOrigin()}${sharePath(wedding.slug, o.version, look.shareKey)}`, o.lang, words);
  // the preview gets everything; the download, the cards and the envelope as two files
  const part = body.part === "card" || body.part === "envelope" ? body.part : "all";
  if (part === "envelope" && o.envelope === "none") return Response.json({ error: "no envelope" }, { status: 400 });
  const pdf = await renderInvitationPdf(inv, o, look.theme, part);
  const names = { bride: wedding.brideName, groom: wedding.groomName };
  const env = envelopeFor(o);
  const name = part === "envelope"
    ? downloadName("envelope", o, names, { name: env.name, paper: flatSheet(env.mm).label })
    : downloadName("card", o, names);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
