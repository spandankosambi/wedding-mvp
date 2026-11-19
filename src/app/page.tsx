import Link from "next/link";
import { BRAND, BRAND_TAGLINE, COPYRIGHT } from "@/lib/brand";
import { EVENT_PRESETS } from "@/lib/presets";
import { SiteHeader } from "./home/SiteHeader";
import { ThemeSweep } from "./home/ThemeSweep";
import { CardRing } from "./home/CardRing";
import { LivePreview } from "./home/LivePreview";
import { RsvpDemo } from "./home/RsvpDemo";
import { OpsBoard } from "./home/OpsBoard";
import { BrandLogo } from "@/components/BrandLogo";
import { GuestFeedback } from "@/components/GuestFeedback";

const DESCRIPTION =
  "A themed invitation site for each family, per-ceremony RSVP that lands in guests' calendars, a guest list that counts itself, and hotels and rooms sorted. Free while we're in pilot.";
export const metadata = {
  title: { absolute: `${BRAND} — ${BRAND_TAGLINE}` },
  description: DESCRIPTION,
  openGraph: { siteName: BRAND, title: `${BRAND} — ${BRAND_TAGLINE}`, description: DESCRIPTION, type: "website", url: "/" },
  twitter: { card: "summary", title: `${BRAND} — ${BRAND_TAGLINE}`, description: DESCRIPTION },
};

/* The ceremonies, in the order a wedding week actually runs them. A real
   sequence, so the layout is a timeline. */
const DAYS: { label: string; from: number; to: number }[] = [
  { label: "Weeks before", from: -99, to: -4 },
  { label: "Three days out", from: -3, to: -3 },
  { label: "Two days out", from: -2, to: -2 },
  { label: "The eve", from: -1, to: -1 },
  { label: "The day", from: 0, to: 0 },
  { label: "After", from: 1, to: 99 },
];

const LIVE: [string, string][] = [
  ["An invitation site in six looks", "Names, parents, your story, every ceremony with its venue, dress code and time. Change the look in April and every page follows."],
  ["Two families, two sites", "The bride's side and the groom's side each get their own invitation, guest list and celebrations, with the common ones shared."],
  ["RSVP per ceremony", "Guests answer each celebration on its own, with who's coming, from one private link and no account. They can change it later."],
  ["Straight into their calendar", "Every yes sends a calendar invitation with the venue and map. One tap on Yes and it's in their phone, with a reminder the day before."],
  ["Invitations from your phone", "Send each family their link on WhatsApp in one tap, or by email under your names. You see who was sent what, and when."],
  ["Hotels and rooms, sorted", "Pick a hotel and room for every out-of-town guest, see each hotel room by room, and send every family their stay details and map."],
  ["A guest list that counts itself", "Upload a spreadsheet, start from our template, or photograph the handwritten one. Families, sides, who hasn't answered, plates per event."],
  ["Print-ready cards", "The same design as your site, laid out as a card for the printer, so the paper invitation and the link match."],
  ["Private by default", "Each family's link is their own. Anyone without it sees only your names and the date, never the venues or the guest list."],
];

const ROADMAP: { when: string; items: [string, string][] }[] = [
  {
    when: "December",
    items: [
      ["WhatsApp reminders, on their own", "Invites and gentle nudges sent for you from a WhatsApp Business number, alongside the email you already have."],
      ["Itineraries, 24 hours before", "Each guest gets their hotel, check-in and pickup on WhatsApp and email the day before they land. Nobody asks you where to go."],
    ],
  },
  {
    when: "January",
    items: [
      ["ID collection, done properly", "Hotels need government IDs at check-in. Guests upload once; stored encrypted, deleted on a schedule, in line with the DPDP Act."],
      ["Cars and buses, live", "Guests see where their pickup is. Drivers run a lightweight web app; each vehicle is tied to a route and the families on it."],
      ["A shared photo drive", "A QR on every table. Guests' photos land in one album while the party is still on."],
    ],
  },
  {
    when: "On the list",
    items: [
      ["Vendor board", "Hotels, decor, catering, photography as a board with quotes, contacts and budget against actual."],
      ["Itineraries by guest tag", "Haldi for immediate family only, reception for everyone; each guest sees only their own schedule."],
      ["Shagun by UPI", "A UPI link on the site for gifts, routed straight to the couple's account."],
    ],
  },
];

export default function Home() {
  return (
    <div id="sweep" data-theme="mehfil-noor" className="themed sweep flex-1">
      <SiteHeader />
      <ThemeSweep initial="mehfil-noor" />

      <main>
        {/* ── hero: six weddings on a ring ───────────────────── */}
        <section data-sweep="mehfil-noor" className="hero">
          <div className="hero-grid">
            <div className="hero-copy">
              <h1 className="font-display hero-h1">
                Five days.<br />Three hundred guests.<br />One link.
              </h1>
              <p className="hero-sub">
                {BRAND} is the Indian wedding, run from a link: a themed invitation site
                for each family, an RSVP for every ceremony that drops into guests&apos;
                calendars, a guest list that counts itself, and every hotel room sorted.
                Live in two minutes.
              </p>
              <div className="hero-ctas">
                <Link href="/start" className="cta">Create your site</Link>
                <Link href="/w/ananya-weds-arjun?k=sample" className="cta-ghost">Open a real wedding</Link>
              </div>
              <p className="hero-note">Free while we&apos;re in pilot. No card, no app, no sales call.</p>
            </div>
            <div className="hero-ring">
              <CardRing />
            </div>
          </div>
        </section>

        {/* ── the live product ───────────────────────────────── */}
        <section id="looks" data-sweep="ivory-editorial" className="sec">
          <div className="wrap"><LivePreview /></div>
        </section>

        {/* ── the guest's half ───────────────────────────────── */}
        <section id="guests" data-sweep="neel-chhapa" className="sec">
          <div className="wrap grid items-center gap-12 md:grid-cols-2 md:gap-16">
            <div>
              <h2 className="font-display h2">Half a minute, on a phone, with no password.</h2>
              <p className="lede">
                This is the real form, and it works. A guest picks the celebrations they can
                make and says how many are coming. Each yes arrives in their inbox as a
                calendar invitation, and plans change, so the same link edits the answer later.
              </p>
              <p className="lede">
                Every reply lands on your dashboard as it happens: who is coming, who
                hasn&apos;t answered, and the plates per event for the caterer. Out-of-town
                guests see where they&apos;re staying, room number and map included.
              </p>
            </div>
            <RsvpDemo />
          </div>
        </section>

        {/* ── the family's half ──────────────────────────────── */}
        <section id="list" data-sweep="raj-mahal" className="sec">
          <div className="wrap">
            <div className="max-w-2xl">
              <h2 className="font-display h2">The guest list is the hard part. So that&apos;s the product.</h2>
              <p className="lede">
                Bring the list you already have, in a spreadsheet, our template, or a photo of
                the one your mother wrote. We read it, ask about anything unclear, and never
                add the same family twice. Send every family their link on WhatsApp or email,
                then watch the replies, the rooms and the plates add up on their own.
              </p>
            </div>
            <div className="mt-12"><OpsBoard /></div>
            <ul className="live-grid">
              {LIVE.map(([t, b]) => (
                <li key={t}>
                  <h3 className="font-display text-2xl tracking-tight">{t}</h3>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>{b}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── ceremonies, as a week ──────────────────────────── */}
        <section id="ceremonies" data-sweep="pichwai-bagh" className="sec">
          <div className="wrap">
            <div className="max-w-2xl">
              <h2 className="font-display h2">A wedding is a week, not a day. We built it that way.</h2>
              <p className="lede">
                Fifteen ceremonies, ready to drop onto your timeline with the right day, a
                dress code and a line of description already written. Hindu, Muslim, Sikh or
                South Indian, the ones you don&apos;t need simply stay off.
              </p>
            </div>
            <ol className="week">
              {DAYS.map((d) => (
                <li key={d.label} className="week-day">
                  <span className="week-label">{d.label}</span>
                  <ul className="week-rites">
                    {EVENT_PRESETS.filter((p) => p.dayOffset >= d.from && p.dayOffset <= d.to).map((p) => (
                      <li key={p.name} className="week-rite" title={p.blurb}>
                        <span className="font-display">{p.name}</span>
                        <span className="week-dress">{p.dressCode}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── the roadmap, honestly ──────────────────────────── */}
        <section id="roadmap" data-sweep="gulaab-rococo" className="sec">
          <div className="wrap">
            <div className="max-w-2xl">
              <h2 className="font-display h2">From the Roka to the Vidaai, by the winter.</h2>
              <p className="lede">
                The invitation, the guest list, calendar invites, print cards and hotel rooms
                are live today. The rest of running a wedding, IDs, pickups and the day-before
                itinerary, ships in the order a wedding needs it. We are building it for our
                own, so the dates are real.
              </p>
            </div>
            <div className="roadmap">
              {ROADMAP.map((g) => (
                <section key={g.when} className="roadmap-col">
                  <h3 className="roadmap-when font-display">{g.when}</h3>
                  <ul>
                    {g.items.map(([t, b]) => (
                      <li key={t} className="roadmap-item">
                        <p className="font-medium">{t}</p>
                        <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>{b}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </section>

        {/* ── closing ───────────────────────────────────────── */}
        <section className="band">
          <h2 className="font-display band-h2">Start with the names. The rest can wait.</h2>
          <p className="mx-auto mt-6 max-w-md text-sm leading-relaxed opacity-80">
            You&apos;ll have a link to send before anyone asks you for one.
          </p>
          <Link href="/start" className="band-cta">Create your site</Link>
        </section>
      </main>

      <footer className="px-6 py-12 text-center">
        <p className="inline-flex items-center" style={{ color: "var(--ink)" }}>
          <BrandLogo height={44} label={BRAND} />
        </p>
        <p className="mt-2 text-sm" style={{ color: "var(--ink-soft)" }}>{BRAND_TAGLINE}</p>
        <nav aria-label="Footer" className="mt-6 flex flex-wrap items-center justify-center gap-6">
          <Link href="/start" className="nav-link">Create a site</Link>
          <Link href="/signin" className="nav-link">Sign in</Link>
          <Link href="/w/ananya-weds-arjun?k=sample" className="nav-link">Example wedding</Link>
          <a href="#roadmap" className="nav-link">Roadmap</a>
          <a href="#contact" className="nav-link">Contact</a>
        </nav>
        <div id="contact" className="mt-8 text-sm" style={{ color: "var(--ink-soft)" }}>
          <div style={{ color: "var(--ink)" }}><GuestFeedback /></div>
        </div>
        <p className="mt-4 text-xs" style={{ color: "var(--ink-soft)" }} data-testid="copyright">{COPYRIGHT}</p>
      </footer>
    </div>
  );
}
