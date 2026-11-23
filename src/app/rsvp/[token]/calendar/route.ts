import { getFamilyByToken } from "@/lib/guests/rsvp";
import { icsFile } from "@/lib/email/calendar";
import { namesFor } from "@/lib/site/looks";
import { appOrigin } from "@/lib/core/origin";

/** The household's calendar file: every celebration they said yes to (or one, with ?event=). */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getFamilyByToken(token);
  if (!data) return new Response("Not found", { status: 404 });
  const only = new URL(req.url).searchParams.get("event");
  const evs = data.events.filter((e) => e.rsvp?.status === "attending" && (!only || e.id === only));
  if (!evs.length) return new Response("Nothing to add yet: say you're coming first.", { status: 404 });
  const couple = namesFor(data.wedding, data.family.side === "groom" ? "groom" : "bride").couple;
  const body = icsFile(evs, { couple, link: `${await appOrigin()}/rsvp/${token}` });
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${evs.length === 1 ? evs[0].name.replace(/[^\w-]+/g, "-").toLowerCase() : "wedding"}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
