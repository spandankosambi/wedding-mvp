import { fmtWeddingDate } from "@/lib/format";

/** A household that arrived from its personal invitation. */
export type InvitedGuest = { familyName: string; href: string; answered: boolean };

export function RsvpCta({
  slug, side, open, deadline, contactPhone, invite,
}: { slug: string; side?: "bride" | "groom"; open: boolean; deadline: Date | null; contactPhone: string | null; invite?: InvitedGuest | null }) {
  return (
    <>
      {/* gota-style scalloped edge eases the jump into the full-bleed band */}
      <div className="scallop" aria-hidden />
      <section
        id="rsvp"
        className="px-6 py-24 text-center md:py-32"
        style={{ background: "var(--band-bg)", color: "var(--band-ink)" }}
      >
        <p className="kicker reveal foil">RSVP</p>
        {invite ? (
          // their personal link works whatever the open-RSVP settings say
          <>
            <h2 className="font-display reveal mx-auto mt-6 max-w-3xl text-4xl tracking-tight md:text-6xl">
              Will {invite.familyName} be joining us?
            </h2>
            <p
              className="reveal mx-auto mt-8 max-w-xl text-sm leading-relaxed opacity-75"
              style={{ "--rd": "0.15s" } as React.CSSProperties}
            >
              {invite.answered
                ? "Thank you for replying. Plans change — you can look at or update your answers anytime."
                : "Your family's names are already on the list — just tick who's coming to each celebration."}
              {!invite.answered && deadline ? ` Kindly reply by ${fmtWeddingDate(deadline)}.` : ""}
            </p>
            <a
              href={invite.href}
              className="reveal mt-10 inline-block px-10 py-4 text-sm uppercase tracking-[0.2em] transition-opacity hover:opacity-90"
              style={{ background: "var(--band-ink)", color: "var(--band-bg)", "--rd": "0.25s" } as React.CSSProperties}
            >
              {invite.answered ? "See or change your RSVP" : "RSVP now"}
            </a>
          </>
        ) : open ? (
          <>
            <h2 className="font-display reveal mx-auto mt-6 max-w-3xl text-4xl tracking-tight md:text-6xl">
              Will you be joining us?
            </h2>
            <p
              className="reveal mx-auto mt-8 max-w-xl text-sm leading-relaxed opacity-75"
              style={{ "--rd": "0.15s" } as React.CSSProperties}
            >
              Tell us which celebrations you can make and how many of you are coming.
              No app, no account — half a minute on your phone.
              {deadline ? ` Kindly reply by ${fmtWeddingDate(deadline)}.` : ""}
            </p>
            <a
              href={`/w/${slug}/rsvp${side ? `?side=${side}` : ""}`}
              className="reveal mt-10 inline-block px-10 py-4 text-sm uppercase tracking-[0.2em] transition-opacity hover:opacity-90"
              style={{ background: "var(--band-ink)", color: "var(--band-bg)", "--rd": "0.25s" } as React.CSSProperties}
            >
              RSVP now
            </a>
          </>
        ) : (
          <>
            <h2 className="font-display reveal mx-auto mt-6 max-w-3xl text-4xl tracking-tight md:text-6xl">
              RSVPs are closed — but we&apos;d still love to hear from you.
            </h2>
            <p className="reveal mx-auto mt-8 max-w-xl text-sm leading-relaxed opacity-75">
              {contactPhone ? `Message the family on ${contactPhone} and we'll make room.` : "Reach out to the family directly and we'll make room."}
            </p>
          </>
        )}
      </section>
    </>
  );
}
