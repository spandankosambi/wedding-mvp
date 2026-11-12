import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { weddings, events } from "@/db/schema";
import { requireRole } from "@/lib/authz";
import { appOrigin } from "@/lib/origin";
import { invitationSchema } from "@/lib/invitation/options";
import { buildInvitation, fileName } from "@/lib/invitation/content";
import { renderInvitationPdf } from "@/lib/invitation/pdf";
import { getLook, withLook, wordingOf } from "@/lib/looks";
import { decorOf } from "@/lib/site-decor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The couple's printable invitation cards, as a PDF download. */
export async function POST(req: Request) {
  const staff = await requireRole(["couple", "admin"]);
  let body: { weddingId?: unknown; options?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }
  const weddingId = staff.role === "admin" && typeof body.weddingId === "string" ? body.weddingId : staff.weddingId;
  if (!weddingId) return Response.json({ error: "no wedding" }, { status: 403 });

  const parsed = invitationSchema.safeParse(body.options ?? {});
  if (!parsed.success) return Response.json({ error: "invalid options" }, { status: 400 });

  const [wedding] = await db.select().from(weddings).where(eq(weddings.id, weddingId));
  if (!wedding) return Response.json({ error: "no wedding" }, { status: 404 });
  // each family's cards in its own look, with its own wording and reply-by date
  const look = await getLook(weddingId, parsed.data.version);
  const o = {
    ...parsed.data,
    icons: decorOf(look).icons && parsed.data.cardIcons, // on under Design touches, unless left off the cards
    invocation: look.invocation ?? "", shloka: look.shloka ?? "", note: look.closingLine ?? "",
    rsvpBride: wordingOf(look).rsvpContacts ?? "", rsvpGroom: wordingOf(look).rsvpContacts ?? "",
    complimentsBride: look.compliments ?? "", complimentsGroom: look.compliments ?? "",
  };
  const evs = await db.select().from(events).where(eq(events.weddingId, weddingId));
  if (o.eventIds?.some((id) => !evs.some((e) => e.id === id))) {
    return Response.json({ error: "invalid events" }, { status: 400 });
  }

  const inv = buildInvitation(withLook(wedding, look), evs, o, `${await appOrigin()}/w/${wedding.slug}?side=${o.version}`);
  const pdf = await renderInvitationPdf(inv, o, look.theme);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName(o)}"`,
      "Cache-Control": "no-store",
    },
  });
}
