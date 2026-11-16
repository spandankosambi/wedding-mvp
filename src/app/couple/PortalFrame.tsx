import Link from "next/link";
import type { ChecklistItem } from "@/lib/checklist";
import { JumpNav } from "./JumpNav";
import { CONTACT_EMAIL } from "@/lib/brand";

/* Edit these three to change what the "About us" box says on every page. */
export const ABOUT = {
  heading: "About us",
  text: "One Tap Invites puts a wedding's invitation website, guest list, RSVPs and printed cards in one place, with a section for each family.",
  /** shown under "Need help?" when filled in, e.g. "hello@example.com" or "+91 98200 00000" */
  contactEmail: CONTACT_EMAIL,
  contactWhatsApp: "",
};

function AboutCard() {
  const wa = ABOUT.contactWhatsApp.replace(/\D/g, "");
  return (
    <section className="portal-about" aria-label={ABOUT.heading}>
      <p className="portal-jump-label">{ABOUT.heading}</p>
      <p>{ABOUT.text}</p>
      <p className="portal-about-help">Need help?</p>
      {ABOUT.contactEmail || wa ? (
        <p>
          {ABOUT.contactEmail && <a href={`mailto:${ABOUT.contactEmail}`}>{ABOUT.contactEmail}</a>}
          {ABOUT.contactEmail && wa && <br />}
          {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">WhatsApp us</a>}
        </p>
      ) : (
        <p>Contact details coming soon.</p>
      )}
    </section>
  );
}

/** "What's done" for a family's side, shown on the right of a page. */
export function Checklist({ title, items }: { title: string; items: ChecklistItem[] }) {
  const done = items.filter((i) => i.done).length;
  return (
    <section className="portal-checklist" aria-label={title}>
      <p className="portal-jump-label">{title}</p>
      <p className="portal-checklist-count"><strong>{done}</strong> of {items.length} done</p>
      <div className="portal-checklist-bar"><span style={{ width: `${Math.round((done / items.length) * 100)}%` }} /></div>
      <ul>
        {items.map((i) => (
          <li key={i.id} data-done={i.done}>
            <span aria-hidden="true">{i.done ? "✓" : ""}</span>
            {i.done ? <span>{i.label}</span> : <Link href={i.href}>{i.label}</Link>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The layout every couple-side page shares: on the left "On this page" with
 * About us under it; the page in the middle; and (where given) a checklist of
 * what's done on the right. On a phone the left list becomes a "Jump to"
 * menu and the two side boxes drop below the page.
 */
export function PortalFrame({ jump = [], right, roomy = false, children }: {
  jump?: [string, string][]; right?: React.ReactNode; children: React.ReactNode;
  /** the page needs the width (the print page's options and preview): the right column waits for a large screen */
  roomy?: boolean;
}) {
  return (
    <div className="portal-shell portal-frame" data-right={right ? (roomy ? "wide" : "true") : undefined}>
      <div className="portal-left">
        {jump.length > 0 && <JumpNav items={jump} />}
        <AboutCard />
      </div>
      <div className="portal-editor-main">{children}</div>
      {right && <aside className="portal-right">{right}</aside>}
    </div>
  );
}
