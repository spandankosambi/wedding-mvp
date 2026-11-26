import type { Metadata } from "next";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { families, weddings } from "@/db/schema";
import { MadeWith } from "@/components/MadeWith";
import { getLook, namesFor } from "@/lib/site/looks";
import { byToken, photosConfigured, sessionProfileId, stateFor, RISHTA_COOKIE } from "@/lib/rishta/profiles";
import { browse, matches } from "@/lib/rishta/match";
import { purgeNow } from "@/lib/rishta/host";
import { DECLARATIONS, KEEP_DAYS } from "@/lib/rishta/rules";
import { CodeGate, Leave, Matches, MyProfile, People } from "./SingleClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Rishta Corner", robots: { index: false, follow: false }, referrer: "no-referrer" };

const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const mask = (email: string) => { const [u, d] = email.split("@"); return `${u.slice(0, 1)}${"•".repeat(Math.max(2, Math.min(6, u.length - 1)))}@${d}`; };

function Shell({ theme, children }: { theme: string; children: React.ReactNode }) {
  return (
    <main data-theme={theme} className="themed min-h-svh px-5 py-12 md:py-20">
      <div className="mx-auto max-w-2xl">{children}</div>
      <MadeWith className="mt-10 pb-8 text-center" />
    </main>
  );
}

/** A single's own Rishta Corner: their profile, other guests, their matches. */
export default async function SingleRishtaPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { token } = await params;
  const { tab } = await searchParams;
  await purgeNow();
  const p = await byToken(token);
  if (!p) {
    return (
      <Shell theme="ivory-editorial">
        <h1 className="font-display text-4xl tracking-tight">This link no longer works.</h1>
        <p className="mt-5 text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
          It may have been replaced by a newer email, the profile may have been deleted, or Rishta Corner has closed for this wedding. If you expected it to work, ask your family to send it again.
        </p>
      </Shell>
    );
  }
  const [[w], [fam]] = await Promise.all([
    db.select().from(weddings).where(eq(weddings.id, p.weddingId)),
    db.select({ side: families.side }).from(families).where(eq(families.id, p.familyId)),
  ]);
  const side = fam?.side === "groom" ? "groom" : "bride";
  const theme = (await getLook(w.id, side)).theme;
  const couple = namesFor(w, side).couple;
  const { phase, settings } = await stateFor(p.weddingId);
  const signedIn = sessionProfileId((await cookies()).get(RISHTA_COOKIE)?.value) === p.id;

  const header = (
    <header>
      <p className="kicker">{couple}&apos;s wedding</p>
      <h1 className="font-display mt-4 tracking-tight" style={{ fontSize: "clamp(2.2rem, 7vw, 3.4rem)", lineHeight: 1.05 }}>Rishta Corner</h1>
    </header>
  );

  if (phase === "off" || phase === "closed") {
    return (
      <Shell theme={theme}>
        {header}
        <p className="mt-6 text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
          {phase === "closed" ? `Rishta Corner closed on ${day(settings.closesOn)}. Profiles are being deleted.` : "Rishta Corner isn't open for this wedding."}
        </p>
      </Shell>
    );
  }
  if (!signedIn) return <Shell theme={theme}>{header}<CodeGate token={token} firstName={p.firstName} masked={mask(p.email)} /></Shell>;

  const live = p.status === "live" && phase === "open";
  const [cards, list] = live ? await Promise.all([browse(p), matches(p)]) : [[], []];
  const view = live && (tab === "people" || tab === "matches") ? tab : "profile";
  const tabs: [string, string][] = [["profile", "My profile"], ["people", `People${cards.length ? ` (${cards.length})` : ""}`], ["matches", `Matches${list.length ? ` (${list.length})` : ""}`]];

  const status =
    p.status === "live" ? (phase === "open" ? `Your profile is live until ${day(settings.closesOn)}.` : `Your profile will show from ${day(settings.opensOn)}.`)
    : p.status === "pending" ? `Published. ${couple} will take a quick look before other guests can see it.`
    : p.status === "removed" ? "The couple removed this profile."
    : "Not published yet. Check everything below, then publish.";

  const notice = (
    <>
      <p>
        <strong>What we show:</strong> your first name, age, city, studies, work, the lines about you and your photos, only to other guests of this wedding who have a published profile and would like to meet someone like you. Never your email.
      </p>
      <p>
        <strong>What stays private until you both agree:</strong> your family contact and your outside profile link. &ldquo;Interested&rdquo; is never shown unless it&apos;s mutual. The couple sees counts, not who likes whom.
      </p>
      <p>
        <strong>How long:</strong> everything is deleted when Rishta Corner closes on {day(settings.closesOn)}, or the moment you delete it. A record that you agreed (without your profile) is kept for {KEEP_DAYS} days, then deleted.
      </p>
      <p>
        <strong>Your rights:</strong> change or delete your profile at any time here. Complaints go to our <a href="/rishta/grievance" className="underline">grievance officer</a>.
      </p>
    </>
  );

  return (
    <Shell theme={theme}>
      <div className="flex items-start justify-between gap-4">{header}<Leave token={token} /></div>
      <p className="r-alert mt-6" data-testid="rishta-status">{status}</p>
      {live && (
        <nav aria-label="Rishta Corner" className="r-tabs mt-6">
          {tabs.map(([id, label]) => <a key={id} href={`?tab=${id}`} aria-current={view === id ? "page" : undefined}>{label}</a>)}
        </nav>
      )}
      {view === "people" ? <People token={token} cards={cards} />
        : view === "matches" ? <Matches token={token} list={list} hasContact={!!p.familyContactPhone} />
        : (
          <MyProfile
            token={token}
            v={{ firstName: p.firstName, gender: p.gender, lookingFor: p.lookingFor, birthYear: p.birthYear, city: p.city, education: p.education, profession: p.profession, bio: p.bio, relation: p.relation, relationShown: p.relationShown, externalUrl: p.externalUrl, familyContactName: p.familyContactName, familyContactPhone: p.familyContactPhone }}
            photos={p.photos.map((ph, i) => ({ src: `/rishta/photo/${p.id}/${i}?v=${encodeURIComponent(ph.pathname.slice(-8))}` }))}
            canPhoto={photosConfigured()}
            status={p.status}
            published={!!p.publishedAt}
            phaseOpen={phase === "open"}
            opensOn={day(settings.opensOn)}
            notice={notice}
            declarations={DECLARATIONS.map((d) => ({ id: d.id, text: d.text }))}
          />
        )}
    </Shell>
  );
}
