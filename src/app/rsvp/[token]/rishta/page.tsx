import type { Metadata } from "next";
import { MadeWith } from "@/components/MadeWith";
import { getFamilyByToken } from "@/lib/guests/rsvp";
import { namesFor } from "@/lib/site/looks";
import { draftsOf, stateFor } from "@/lib/rishta/profiles";
import { purgeNow } from "@/lib/rishta/host";
import { RishtaHousehold, type DraftRow } from "./RishtaHousehold";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Rishta Corner", robots: { index: false, follow: false } };

const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", timeZone: "UTC" });

function Note({ theme, title, children }: { theme: string; title: string; children: React.ReactNode }) {
  return (
    <main data-theme={theme} className="themed flex min-h-svh flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display max-w-xl text-4xl tracking-tight">{title}</h1>
      <p className="mt-6 max-w-md text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>{children}</p>
      <MadeWith className="mt-14" />
    </main>
  );
}

/** Rishta Corner from a household's own invitation link. */
export default async function HouseholdRishtaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await purgeNow();
  const data = await getFamilyByToken(token);
  if (!data) {
    return <Note theme="ivory-editorial" title="This link has wandered off the guest list.">It may have expired or been replaced. Open the newest invitation email from the family and try again.</Note>;
  }
  const { family, wedding } = data;
  const { phase, settings } = await stateFor(wedding.id);
  const back = <a href={`/rsvp/${token}`} className="kicker" style={{ color: "var(--ink-soft)", letterSpacing: "0.18em" }}>← Back to your RSVP</a>;
  if (phase === "off") {
    return <Note theme={wedding.theme} title="Rishta Corner isn't open for this wedding.">{back}</Note>;
  }
  if (phase === "closed") {
    return <Note theme={wedding.theme} title="Rishta Corner has closed.">It closed on {day(settings.closesOn)}, and every profile has been deleted. {back}</Note>;
  }
  const couple = namesFor(wedding, family.side === "groom" ? "groom" : "bride").couple;
  const drafts: DraftRow[] = (await draftsOf(family.id)).map((p) => ({
    id: p.id, email: p.email, sent: !!p.sentAt, opened: !!p.verifiedAt, status: p.status,
    firstName: p.firstName, gender: p.gender, lookingFor: p.lookingFor, birthYear: p.birthYear, city: p.city, education: p.education,
    profession: p.profession, bio: p.bio, relation: p.relation, relationShown: p.relationShown, externalUrl: p.externalUrl,
    familyContactName: p.familyContactName, familyContactPhone: p.familyContactPhone,
  }));

  return (
    <main data-theme={wedding.theme} className="themed min-h-svh px-5 py-12 md:py-20">
      <div className="mx-auto max-w-2xl">
        {back}
        <header className="mt-8">
          <h1 className="font-display tracking-tight" style={{ fontSize: "clamp(2.2rem, 7vw, 3.6rem)", lineHeight: 1.05 }}>Rishta Corner</h1>
          <p className="mt-4 text-base leading-relaxed" style={{ color: "var(--ink-soft)" }}>
            Someone single in your family? Start a profile for them here. Only guests of {couple}&apos;s wedding who have a profile can see it,
            from {day(settings.opensOn)} to {day(settings.closesOn)}. Then it&apos;s deleted.
          </p>
          <p className="r-note mt-3">They decide: they open it with a code sent to their own email, check it, and publish it themselves. Over 18 for women, over 21 for men.</p>
        </header>
        <RishtaHousehold token={token} drafts={drafts} />
        <p className="r-note mt-10">
          Questions or a complaint? <a href="/rishta/grievance" className="underline">Contact the grievance officer</a>.
        </p>
      </div>
      <MadeWith className="mt-10 pb-8 text-center" />
    </main>
  );
}
