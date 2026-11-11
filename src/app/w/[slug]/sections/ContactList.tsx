import { contactHref, type RsvpPerson } from "@/lib/contacts";

function WhatsAppIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="16" height="16" fill="currentColor" className="inline-block shrink-0">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4a.5.5 0 0 0 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.4.8 3.2.7a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3Z" />
    </svg>
  );
}
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
    <ul className={`flex flex-wrap justify-center gap-x-10 gap-y-3 ${className}`} data-testid="rsvp-contacts">
      {contacts.map((c, i) => (
        <li key={i} className="text-base">
          {c.name && <span className="block text-sm opacity-75">{c.name}</span>}
          <a
            href={contactHref(c)}
            {...(c.whatsapp && { target: "_blank", rel: "noopener noreferrer" })}
            className="inline-flex items-center gap-1.5 underline decoration-1 underline-offset-4 hover:opacity-80"
            aria-label={`${c.whatsapp ? "WhatsApp" : "Call"} ${c.name || ""} on ${c.phone}`.replace(/\s+/g, " ")}
          >
            {c.whatsapp ? <WhatsAppIcon /> : <PhoneIcon />}
            {c.phone}
          </a>
        </li>
      ))}
    </ul>
  );
}
