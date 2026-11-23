import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { families, guests } from "@/db/schema";

/**
 * Each household has exactly one primary guest — an adult when there is one —
 * and invites (email or WhatsApp) go to that person. The family row's
 * email/phone mirror the primary's, so everything that reads a household's
 * contact (sending invites, matching an open RSVP, the tables) stays correct.
 *
 * Call after anything that adds, removes or edits a household's guests.
 * `fallback` fills in the primary's contact where they have none (an import
 * row's email, the details someone typed on the open RSVP form).
 */
export async function syncHousehold(familyId: string, fallback?: { email?: string | null; phone?: string | null }) {
  const members = await db.select().from(guests).where(eq(guests.familyId, familyId)).orderBy(guests.seq);
  if (members.length === 0) {
    await db.update(families).set({ email: "", phone: null }).where(eq(families.id, familyId));
    return null;
  }
  const adults = members.filter((m) => m.ageGroup === "adult");
  const marked = members.filter((m) => m.isPrimary);
  // keep a valid choice; otherwise the first adult, else the first guest
  let primary = marked.find((m) => m.ageGroup === "adult") ?? (adults.length ? adults[0] : marked[0] ?? members[0]);

  for (const m of members) {
    const should = m.id === primary.id;
    if (m.isPrimary !== should) await db.update(guests).set({ isPrimary: should }).where(eq(guests.id, m.id));
  }

  const email = primary.email?.trim() || fallback?.email?.trim() || null;
  const phone = primary.phone?.trim() || fallback?.phone?.trim() || null;
  if (email !== (primary.email ?? null) || phone !== (primary.phone ?? null)) {
    await db.update(guests).set({ email, phone }).where(eq(guests.id, primary.id));
    primary = { ...primary, email, phone };
  }
  await db.update(families).set({ email: email ?? "", phone }).where(eq(families.id, familyId));
  return primary;
}
