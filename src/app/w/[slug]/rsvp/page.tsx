import type { Metadata } from "next";
import { sideNamesOf } from "@/lib/side-names";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicWedding, rsvpWindow } from "@/lib/open-rsvp";
import { fmtWeddingDate } from "@/lib/format";
import { Ornament } from "@/themes/ornaments";
import { ContactList } from "../sections/ContactList";
import { OpenRsvpForm } from "./OpenRsvpForm";
import { asFamilySide, getLook, namesFor, withLook, type FamilySide } from "@/lib/looks";
import { MadeWith } from "@/components/MadeWith";
import { keyOpens, sharePath } from "@/lib/share";
import { PrivateInvitation } from "../PrivateInvitation";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ side?: string; k?: string }> }): Promise<Metadata> {
  const data = await getPublicWedding((await params).slug);
  const side = asFamilySide((await searchParams).side) ?? "bride";
  return { title: data ? `RSVP · ${namesFor(data.wedding, side).couple}` : "RSVP", robots: { index: false } };
}

export default async function OpenRsvpPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ side?: string; k?: string }> }) {
  const { slug } = await params;
  const data = await getPublicWedding(slug);
  if (!data) notFound();
  const side: FamilySide = asFamilySide((await searchParams).side) ?? "bride";
  const look = await getLook(data.wedding.id, side);
  // the reply form opens only from the family's own link
  if (!keyOpens(look, (await searchParams).k)) return <PrivateInvitation wedding={data.wedding} look={look} side={side} />;
  const wedding = withLook(data.wedding, look);
  const { events } = data;
  const window = rsvpWindow(wedding);
  const coupleNames = namesFor(wedding, side).couple;

  return (
    <main data-theme={wedding.theme} className="themed min-h-svh px-6 py-16 md:py-24">
      <div className="mx-auto max-w-2xl">
        <header className="text-center">
          <Link href={sharePath(slug, side, look.shareKey)} className="kicker rise rise-1 inline-block underline-offset-4 hover:underline">
            ← {coupleNames} · {fmtWeddingDate(wedding.weddingDate)}
          </Link>
          <h1
            className="font-display rise rise-2 mt-6 tracking-tight"
            style={{ fontSize: "clamp(2.6rem, 8vw, 4.5rem)", lineHeight: 1.02 }}
          >
            {window.open ? "Will you be joining us?" : window.reason === "closed" ? "Replies are by personal invitation" : "RSVPs are closed"}
          </h1>
          <p className="rise rise-3 mt-6 text-base md:text-lg" style={{ color: "var(--ink-soft)" }}>
            {window.open
              ? "Tell us who's coming and to which celebrations. It takes half a minute, and you can change your answer later."
              : window.reason === "closed"
                ? "Please reply from the invitation link sent to your family, or reach the family for one."
                : wedding.contacts.length
                  ? "Reach the family below — we'll make room."
                  : "Reach out to the family directly — we'll make room."}
          </p>
          {!window.open && <ContactList contacts={wedding.contacts} className="rise rise-3 mt-6" />}
          <div className="rise rise-3 mt-8">
            <Ornament theme={wedding.theme} slot="hero" />
          </div>
        </header>

        {window.open && events.length > 0 && (
          <OpenRsvpForm
            slug={slug}
            names={sideNamesOf(data.wedding)}
            initialSide={side}
            shareKey={look.shareKey}
            events={events.map((e) => ({
              id: e.id, name: e.name, side: e.side, startsAtISO: e.startsAt.toISOString(), timeZone: e.timeZone,
              venueName: e.venueName, address: e.address, dressCode: e.dressCode,
            }))}
          />
        )}
        {window.open && events.length === 0 && (
          <p className="mt-12 text-center text-sm" style={{ color: "var(--ink-soft)" }}>
            The celebrations haven&apos;t been announced yet — check back soon.
          </p>
        )}
      </div>
      <MadeWith className="mt-10 pb-8 text-center" />
    </main>
  );
}
