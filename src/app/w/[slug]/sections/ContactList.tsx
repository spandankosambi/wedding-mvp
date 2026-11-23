import { contactHref, type RsvpPerson } from "@/lib/guests/contacts";
import { WhatsAppIcon } from "@/components/icons";

function PhoneIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" className="inline-block shrink-0">
      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" strokeLinejoin="round" />
    </svg>
  );
}

/** The family's RSVP contacts: a tap opens WhatsApp, or the dialler for other numbers. */
export function ContactList({ contacts, className = "" }: { contacts: RsvpPerson[]; className?: string }) {
  if (!contacts.length) return null;
  return (
    <ul className={`flex flex-wrap justify-center gap-x-8 gap-y-4 md:gap-x-10 ${className}`} data-testid="rsvp-contacts">
      {contacts.map((c, i) => (
        <li key={i} className="whitespace-nowrap text-base">
          {c.name && <span className="block text-sm opacity-75">{c.name}</span>}
          {c.phone.replace(/\D/g, "").length < 7 ? (
            // a placeholder (the example wedding): shown, not dialled
            <span className="inline-flex items-center gap-1.5" data-testid="contact-placeholder">{c.whatsapp ? <WhatsAppIcon className="inline-block h-4 w-4 shrink-0" /> : <PhoneIcon />}
            {c.phone}</span>
          ) : (
          <a
            href={contactHref(c)}
            {...(c.whatsapp && { target: "_blank", rel: "noopener noreferrer" })}
            className="inline-flex items-center gap-1.5 underline decoration-1 underline-offset-4 hover:opacity-80"
            aria-label={`${c.whatsapp ? "WhatsApp" : "Call"} ${c.name || ""} on ${c.phone}`.replace(/\s+/g, " ")}
          >
            {c.whatsapp ? <WhatsAppIcon className="inline-block h-4 w-4 shrink-0" /> : <PhoneIcon />}
            {c.phone}
          </a>
          )}
        </li>
      ))}
    </ul>
  );
}
