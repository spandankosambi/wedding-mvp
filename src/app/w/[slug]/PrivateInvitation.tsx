import { fmtWeddingDate } from "@/lib/core/format";
import { namesFor, type FamilySide, type Look } from "@/lib/site/looks";
import { Ornament } from "@/themes/ornaments";
import { MadeWith } from "@/components/MadeWith";

/**
 * What a visitor without the family's link code sees: who is getting married
 * and when, and how to get the real invitation. No venues, no phone numbers,
 * no reply form.
 */
export function PrivateInvitation({ wedding, look, side }: {
  wedding: { brideName: string; groomName: string; weddingDate: Date }; look: Look; side: FamilySide;
}) {
  const n = namesFor(wedding, side);
  return (
    <main data-theme={look.theme} className="themed flex min-h-svh flex-1 flex-col items-center justify-center px-6 py-16 text-center" data-testid="private-invitation">
      <Ornament theme={look.theme} slot="hero" />
      <p className="kicker mt-8">A private invitation</p>
      <h1 className="font-display mt-6 tracking-tight" style={{ fontSize: "clamp(2.6rem, 9vw, 5rem)", lineHeight: 1.02 }}>
        {n.first} <span style={{ color: "var(--accent)" }}>&amp;</span> {n.second}
      </h1>
      <p className="kicker mt-6">{fmtWeddingDate(wedding.weddingDate)}</p>
      <p className="mx-auto mt-10 max-w-md text-base leading-relaxed" style={{ color: "var(--ink-soft)" }}>
        The details of this celebration are shared with invited guests only.
        Please open the link the family sent you, or ask them for your invitation.
      </p>
      <MadeWith className="mt-14" />
    </main>
  );
}
