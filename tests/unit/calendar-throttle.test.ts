import { describe, it, expect, beforeAll, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, migrateDb } from "@/db/client";
import { weddings, events, families, guests, eventInvites, rsvps, outbox } from "@/db/schema";
import { generateInviteToken, tokenExpiry } from "@/lib/auth/tokens";

/* After an RSVP, at most one calendar invitation and one cancellation per
   household per celebration an hour. The answer always saves. */
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "localhost:3000", "x-real-ip": "7.7.7.7" }) }));
const { submitRsvpAction } = await import("@/app/rsvp/actions");

let token: string, familyId: string, sangeet: string;
const calendarMails = async () => (await db.select().from(outbox).where(eq(outbox.kind, "calendar"))).length;
const answer = (status: "attending" | "declined") => submitRsvpAction({ token, responses: [{ eventId: sangeet, status, headcount: status === "attending" ? 2 : 0 }] });
const saved = async () => (await db.select().from(rsvps).where(and(eq(rsvps.familyId, familyId), eq(rsvps.eventId, sangeet))))[0]?.status;

beforeAll(async () => {
  process.env.EMAIL_MODE = "file";
  await migrateDb();
  const [w] = await db.insert(weddings).values({ slug: "cal1", brideName: "A", groomName: "B", weddingDate: new Date("2030-11-20") }).returning();
  [{ id: sangeet }] = await db.insert(events).values({ weddingId: w.id, name: "Sangeet", startsAt: new Date("2030-11-19T18:00:00Z"), venueName: "V", address: "X" }).returning();
  const t = generateInviteToken(); token = t.token;
  [{ id: familyId }] = await db.insert(families).values({ weddingId: w.id, name: "Raos", side: "bride", email: "rao@site.org", inviteTokenHash: t.tokenHash, tokenExpiresAt: tokenExpiry(w.weddingDate) }).returning();
  await db.insert(guests).values([{ familyId, fullName: "P Rao" }, { familyId, fullName: "Q Rao" }]);
  await db.insert(eventInvites).values({ eventId: sangeet, familyId });
});

describe("calendar emails after an RSVP", () => {
  it("one for a new yes", async () => {
    expect((await answer("attending")).ok).toBe(true);
    expect(await calendarMails()).toBe(1);
  });
  it("a quick no still takes it off their calendar (one cancellation)", async () => {
    expect((await answer("declined")).ok).toBe(true);
    expect(await saved()).toBe("declined");
    expect(await calendarMails()).toBe(2);
  });
  it("flipping yes and no again within the hour saves every answer but sends no more", async () => {
    for (const s of ["attending", "declined", "attending", "declined"] as const) {
      expect((await answer(s)).ok).toBe(true);
      expect(await saved()).toBe(s);
    }
    expect(await calendarMails()).toBe(2);
  });
});
