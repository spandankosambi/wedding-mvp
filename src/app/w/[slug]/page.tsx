import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicWedding } from "@/lib/open-rsvp";
import { fixShortMapLinks } from "@/lib/maplinks";
import { asFamilySide, getLook, namesFor, withLook, type FamilySide } from "@/lib/looks";
import { eventForSide } from "@/lib/sides";
import { rsvpWindow } from "@/lib/open-rsvp";
import { Hero } from "./sections/Hero";
import { Marquee } from "./sections/Marquee";
import { ScrollFx } from "./sections/ScrollFx";
import { Story } from "./sections/Story";
import { EventTimeline } from "./sections/EventTimeline";
import { TravelStay } from "./sections/TravelStay";
import { Gallery } from "./sections/Gallery";
import { Closing } from "./sections/Closing";
import { wordingLines } from "@/lib/invitation/content";
import { RsvpCta, type InvitedGuest } from "./sections/RsvpCta";
import { InviteBar } from "./sections/InviteBar";
import { getFamilyByToken } from "@/lib/rsvp";
import { fmtWeddingDate } from "@/lib/format";
import { galleryOf } from "@/lib/gallery";

export const dynamic = "force-dynamic";

// The wedding-day city: what the couple typed, else where the Pheras happen
function weddingCity(city: string | null, events: { name: string; address: string | null }[]) {
  if (city) return city;
  const main = events.find((e) => e.name === "Pheras") ?? events[events.length - 1];
  return main?.address?.split(",").pop()?.trim();
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/** The household behind ?invite=<token>, if the token is current and belongs
    to this wedding. Anything else just shows the ordinary site. */
async function invitedGuest(weddingId: string, searchParams: SearchParams): Promise<
  (InvitedGuest & { eventIds: Set<string>; showTravel: boolean; side: FamilySide }) | null
> {
  const token = (await searchParams).invite;
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  const data = await getFamilyByToken(token);
  if (!data || data.wedding.id !== weddingId) return null;
  return {
    familyName: data.family.name,
    href: `/rsvp/${token}`,
    answered: data.events.some((e) => e.rsvp),
    eventIds: new Set(data.events.map((e) => e.id)),
    showTravel: data.family.showTravel,
    // a household from before the split ("both") sees the bride's family's look
    side: (data.family.side === "groom" ? "groom" : "bride") as FamilySide,
  };
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const data = await getPublicWedding((await params).slug);
  if (!data) return { title: "Wedding" };
  const { wedding } = data;
  const personal = typeof (await searchParams).invite === "string";
  const side = (await invitedGuest(wedding.id, searchParams))?.side ?? asFamilySide((await searchParams).side) ?? "bride";
  const n = namesFor(wedding, side);
  return {
    // a personal invitation link is nobody's search result
    ...(personal ? { robots: { index: false, follow: false } } : {}),
    title: `${n.first} weds ${n.second}`,
    description: wedding.heroTagline ?? `Join us on ${fmtWeddingDate(wedding.weddingDate)}`,
    openGraph: {
      title: n.couple,
      description: `${fmtWeddingDate(wedding.weddingDate)}${wedding.city ? ` · ${wedding.city}` : ""} — you're invited. Tap to see the celebrations and RSVP.`,
      type: "website",
    },
  };
}

export default async function WeddingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}) {
  const data = await getPublicWedding((await params).slug);
  if (!data) notFound();
  const invite = await invitedGuest(data.wedding.id, searchParams);
  // One site, two looks: a guest sees their family's side (from their
  // invitation, or the ?side= of the family's shared link); the plain
  // address shows the bride's.
  const side: FamilySide = invite?.side ?? asFamilySide((await searchParams).side) ?? "bride";
  const look = await getLook(data.wedding.id, side);
  // short Google Maps links some networks can't open → their full address (once)
  const fixed = await fixShortMapLinks(data.wedding.id, data.events, look.travel, side);
  const wedding = withLook(data.wedding, { ...look, travel: fixed.travel });
  const events = data.events.map((e) => (fixed.eventUrls.has(e.id) ? { ...e, mapUrl: fixed.eventUrls.get(e.id)! } : e));
  // A household's own invitation shows only the events they're invited to
  // (the same list as their RSVP page), and Travel & Stay only if the
  // committee shows it to them. A family's link shows the common events and its own.
  const shown = invite ? events.filter((e) => invite.eventIds.has(e.id)) : events.filter((e) => eventForSide(e.side, side));
  const window = rsvpWindow(wedding);
  // section numbers count only what this wedding actually shows
  const hasTravel = !!(wedding.travel?.stays?.length || wedding.travel?.gettingThere) && (!invite || invite.showTravel);
  let n = 0;
  const no = () => String(++n).padStart(2, "0");
  const storyNo = wedding.story ? no() : "";
  const eventsNo = no();
  const travelNo = hasTravel ? no() : "";
  const gallery = galleryOf(wedding);
  const galleryNo = gallery.enabled ? no() : "";

  return (
    <main data-theme={wedding.theme} className="themed flex-1">
      {/* arm scroll-fx before below-fold sections paint (no reveal flash);
          ScrollFx then drives the observers after hydration */}
      <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('fx')" }} />
      <ScrollFx />
      <Hero wedding={wedding} side={side} city={weddingCity(wedding.city, events)} />
      <Marquee items={[...shown.map((e) => e.name), fmtWeddingDate(wedding.weddingDate)]} />
      <Story theme={wedding.theme} story={wedding.story} no={storyNo} />
      <EventTimeline theme={wedding.theme} events={shown} no={eventsNo} />
      {hasTravel && <TravelStay travel={wedding.travel} no={travelNo} />}
      {gallery.enabled && <Gallery theme={wedding.theme} no={galleryNo} photos={gallery.photos} />}
      <RsvpCta slug={wedding.slug} side={side} open={window.open} deadline={wedding.rsvpDeadline} contacts={wedding.contacts} invite={invite} />
      <Closing theme={wedding.theme} closingLine={wedding.closingLine} compliments={wordingLines(wedding.compliments)} />
      {/* room under the footer so the invitation bar never covers it */}
      <footer className="hairline-t px-6 py-10 text-center" style={invite ? { paddingBottom: "7rem" } : undefined}>
        <p className="kicker">
          {namesFor(wedding, side).couple} · {fmtWeddingDate(wedding.weddingDate)}
          {wedding.hashtag ? ` · #${wedding.hashtag}` : ""}
        </p>
      </footer>
      {invite && <InviteBar familyName={invite.familyName} href={invite.href} answered={invite.answered} />}
    </main>
  );
}
