import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db, migrateDb } from "@/db/client";
import { weddings, families, emailLog, outbox } from "@/db/schema";
import {
  sendInvite, sendSignInLink, sendConfirmEmail, sendStayEmail, sendQueued, sentToday, smtpServer, EmailBudgetError,
} from "@/lib/email/mailer";

/* EMAIL_DAILY_BUDGET=60: everything but sign-in links stops at 10, sign-in at 60. */
let familyId: string;
const invite = () => sendInvite({ familyId, to: "mehta@site.org", familyName: "Mehtas", coupleNames: "A & B", rsvpUrl: "http://x/rsvp/t", theme: "raj-mahal", type: "invite" });
/** pretend `n` emails went out in the last day */
async function used(n: number) {
  await db.delete(outbox);
  if (n) await db.insert(outbox).values(Array.from({ length: n }, (_, i) => ({ to: `x${i}@site.org`, subject: "s", kind: "invite", status: "sent", sentAt: new Date() })));
}

beforeAll(async () => {
  process.env.EMAIL_MODE = "file";
  process.env.EMAIL_DAILY_BUDGET = "60";
  await migrateDb();
  const [w] = await db.insert(weddings).values({ slug: "budget1", brideName: "A", groomName: "B", weddingDate: new Date("2030-11-20") }).returning();
  [{ id: familyId }] = await db.insert(families).values({ weddingId: w.id, name: "Mehtas", side: "bride", email: "mehta@site.org" }).returning();
});
beforeEach(() => used(0));

describe("the daily email budget", () => {
  it("counts every email sent in the last 24 hours, and nothing older", async () => {
    await used(3);
    await db.insert(outbox).values({ to: "old@site.org", subject: "s", kind: "invite", status: "sent", sentAt: new Date(Date.now() - 25 * 3_600_000) });
    expect(await sentToday()).toBe(3);
    expect((await invite()).ok).toBe(true);
    expect(await sentToday()).toBe(4);
  });

  it("queues invitations and stay details once only the sign-in reserve is left", async () => {
    await used(10);
    expect(await invite()).toEqual({ ok: true, queued: true });
    expect(await sendStayEmail({ to: "m@site.org", familyName: "Mehtas", coupleNames: "A & B", gettingThere: "", groups: [] })).toBe("queued");
    expect(await sentToday()).toBe(10); // nothing more went out
    const q = await db.select().from(outbox).where(eq(outbox.status, "queued"));
    expect(q.map((r) => r.kind).sort()).toEqual(["invite", "stay"]);
    expect(q[0].payload?.html).toBeTruthy();
    // the guest list shows it as queued, not failed
    expect((await db.select().from(emailLog).where(eq(emailLog.familyId, familyId))).some((l) => l.status === "queued")).toBe(true);
  });

  it("still sends sign-in links from the reserve, up to the whole budget", async () => {
    await used(10);
    await sendSignInLink("couple@site.org", "http://x/signin", async () => {});
    expect(await sentToday()).toBe(11);
    await used(60);
    await expect(sendSignInLink("couple@site.org", "http://x/signin", async () => {})).rejects.toBeInstanceOf(EmailBudgetError);
  });

  it("a confirmation link, which expires in minutes, fails clearly instead of queueing", async () => {
    await used(10);
    await expect(sendConfirmEmail({ to: "c@site.org", kind: "delete", coupleNames: "A & B", link: "http://x/confirm/t", minutes: 15 }))
      .rejects.toBeInstanceOf(EmailBudgetError);
  });

  it("queued mail goes out later, when the allowance frees up, and is logged against the household", async () => {
    await used(10);
    await invite();
    expect(await sendQueued()).toEqual({ sent: 0, left: 1 }); // still no room
    // a day later the earlier mail no longer counts
    await db.update(outbox).set({ sentAt: new Date(Date.now() - 25 * 3_600_000) }).where(eq(outbox.status, "sent"));
    expect(await sendQueued()).toEqual({ sent: 1, left: 0 });
    expect(await sentToday()).toBe(1);
    const logs = await db.select().from(emailLog).where(eq(emailLog.familyId, familyId));
    expect(logs.some((l) => l.status === "sent")).toBe(true);
  });
});

describe("mail server settings", () => {
  it("come only from settings: Gmail by default, any host when set", () => {
    process.env.SMTP_USER = "u"; process.env.SMTP_PASS = "p";
    expect(smtpServer()).toEqual({ service: "gmail", auth: { user: "u", pass: "p" } });
    process.env.SMTP_HOST = "smtp.resend.com"; process.env.SMTP_PORT = "587"; process.env.SMTP_SECURE = "false";
    expect(smtpServer()).toEqual({ host: "smtp.resend.com", port: 587, secure: false, auth: { user: "u", pass: "p" } });
    for (const k of ["SMTP_USER", "SMTP_PASS", "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE"]) delete process.env[k];
  });
});
