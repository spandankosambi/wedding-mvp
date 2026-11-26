import type { Metadata } from "next";
import { env } from "@/config/env";
import { MadeWith } from "@/components/MadeWith";
import { BRAND } from "@/lib/core/brand";

export const metadata: Metadata = { title: "Rishta Corner: grievance officer", robots: { index: false, follow: false } };

/** Who to complain to, and what happens next (DPDP Act and IT Rules). */
export default function GrievancePage() {
  const email = env.contactEmail;
  return (
    <main data-theme="ivory-editorial" className="themed min-h-svh px-5 py-12 md:py-20">
      <div className="mx-auto max-w-2xl">
        <h1 className="font-display tracking-tight" style={{ fontSize: "clamp(2rem, 6vw, 3rem)", lineHeight: 1.05 }}>Rishta Corner: complaints and your data</h1>
        <section className="r-card mt-8 grid gap-2 text-sm leading-relaxed">
          <h2 className="font-display text-xl">Grievance officer</h2>
          <p>Spandan Kosambi, for {BRAND}</p>
          {email ? <p>Email: <a href={`mailto:${email}?subject=Rishta%20Corner%20complaint`} className="underline">{email}</a></p> : <p>Email: reply to any Rishta Corner email you&apos;ve received.</p>}
          <p className="r-note">We acknowledge every complaint within 24 hours and resolve it within 15 days.</p>
        </section>
        <section className="mt-8 grid gap-3 text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
          <h2 className="font-display text-xl" style={{ color: "var(--ink)" }}>What you can ask for</h2>
          <p><strong>A profile of you that you didn&apos;t agree to:</strong> email us the wedding and the first name shown. We hide it the same day and delete it once checked.</p>
          <p><strong>Someone under age, a fake profile or harassment:</strong> use &ldquo;Report&rdquo; on the profile. Serious reports hide the profile at once.</p>
          <p><strong>Your own data:</strong> you can see, change or delete your profile at any time from your own link. To get a copy of what we hold, or to withdraw consent, email us.</p>
          <p><strong>How long we keep things:</strong> profiles, photos and interests are deleted when Rishta Corner closes for the wedding. A record that you agreed, and any reports, are kept for 180 days, then deleted.</p>
          <p>If you aren&apos;t satisfied with our answer, you may complain to the Data Protection Board of India.</p>
        </section>
      </div>
      <MadeWith className="mt-10 pb-8 text-center" />
    </main>
  );
}
