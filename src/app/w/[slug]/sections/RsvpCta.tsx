import { fmtWeddingDate } from "@/lib/format";
import type { RsvpPerson } from "@/lib/contacts";
import { ContactList } from "./ContactList";
import { sharePath } from "@/lib/share";

/** A household that arrived from its personal invitation. */
export type InvitedGuest = { familyName: string; href: string; answered: boolean };

export function RsvpCta({
  slug, side, shareKey = null, open, deadline, contacts = [], invite,
}: {
  slug: string; side?: "bride" | "groom"; open: boolean; deadline: Date | null;
  /** the code of the family's shared link, carried on to the reply form */
  shareKey?: string | null;
  /** the family's RSVP contacts (as on the printed card) */
  contacts?: RsvpPerson[];
  invite?: InvitedGuest | null;
}) {
  return (
    <>
      {/* gota-style scalloped edge eases the jump into the full-bleed band */}
      <div className="scallop" aria-hidden />
      <section
        id="rsvp"
        className="px-5 py-16 text-center md:px-6 md:py-32"
        style={{ background: "var(--band-bg)", color: "var(--band-ink)" }}
      >
        <p className="kicker reveal foil">RSVP</p>
        {invite ? (
          // their personal link works whatever the open-RSVP settings say
          <>
            <h2 className="font-display reveal mx-auto mt-6 max-w-3xl text-3xl tracking-tight sm:text-4xl md:text-6xl">
              Will {invite.familyName} be joining us?
            </h2>
            <p
              className="reveal mx-auto mt-5 max-w-xl text-sm leading-relaxed opacity-75 md:mt-8"
              style={{ "--rd": "0.15s" } as React.CSSProperties}
            >
              {invite.answered
                ? "Thank you for replying. Plans change — you can look at or update your answers anytime."
                : "Your family's names are already on the list — just tick who's coming to each celebration."}
              {!invite.answered && deadline ? ` Kindly reply by ${fmtWeddingDate(deadline)}.` : ""}
            </p>
            <a
              href={invite.href}
              className="rsvp-cta reveal"
              style={{ background: "var(--band-ink)", color: "var(--band-bg)", "--rd": "0.25s" } as React.CSSProperties}
            >
              {invite.answered ? "See or change your RSVP" : "Confirm your attendance"} <span aria-hidden>→</span>
            </a>
          </>
        ) : open ? (
          <>
            <h2 className="font-display reveal mx-auto mt-6 max-w-3xl text-3xl tracking-tight sm:text-4xl md:text-6xl">
              Will you be joining us?
            </h2>
            <p
              className="reveal mx-auto mt-5 max-w-xl text-sm leading-relaxed opacity-75 md:mt-8"
              style={{ "--rd": "0.15s" } as React.CSSProperties}
            >
              Tell us which celebrations you can make and how many of you are coming.
              No app, no account — half a minute on your phone.
              {deadline ? ` Kindly reply by ${fmtWeddingDate(deadline)}.` : ""}
            </p>
            <a
              href={sharePath(slug, side ?? "bride", shareKey, "/rsvp")}
              className="rsvp-cta reveal"
              style={{ background: "var(--band-ink)", color: "var(--band-bg)", "--rd": "0.25s" } as React.CSSProperties}
            >
              Confirm your attendance <span aria-hidden>→</span>
            </a>
          </>
        ) : (
          <>
            <h2 className="font-display reveal mx-auto mt-6 max-w-3xl text-3xl tracking-tight sm:text-4xl md:text-6xl">
              Replies are by personal invitation.
            </h2>
            <p className="reveal mx-auto mt-5 max-w-xl text-sm leading-relaxed opacity-75 md:mt-8">
              Please reply from the invitation link sent to your family.{" "}
              {contacts.length ? "If you haven't received one, message the family below." : "If you haven't received one, reach out to the family directly."}
            </p>
          </>
        )}
        {contacts.length > 0 && (
          <div className="reveal mx-auto mt-8 max-w-xl md:mt-10">
            <ContactList contacts={contacts} />
          </div>
        )}
      </section>
    </>
  );
}
