import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, migrateDb } from "@/db/client";
import { weddings, users, planTasks, planMeetings } from "@/db/schema";
import { accessFor } from "@/lib/auth/access";
import { spacesFor, canReach, canDelete, meetingTypeAllowed, spaceLabel } from "@/lib/plan/spaces";
import { tasksIn } from "@/lib/plan/tasks";
import { meetingsIn } from "@/lib/plan/meetings";
import { STARTER_TASKS } from "@/lib/plan/starter";

/* Plan permissions: the pure rules, then "should be refused" through the
   real server actions, with a pretend signed-in person. */
let signedIn: Record<string, unknown> | null = null;
vi.mock("@/auth", () => ({ auth: async () => (signedIn ? { user: signedIn } : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw Object.assign(new Error("redirect"), { to }); } }));
const A = await import("@/app/couple/plan/actions");

const committee = (side: "bride" | "groom" | "both") => accessFor({ role: "committee", side, access: { site: "none", guests: "none", print: "none" } });
const couple = accessFor({ role: "couple" });

describe("which spaces each role reaches", () => {
  it("the couple (and admin) reach all three", () => {
    expect(spacesFor(couple)).toEqual(["both", "bride", "groom"]);
    expect(spacesFor(accessFor({ role: "admin" }))).toEqual(["both", "bride", "groom"]);
  });
  it("a one-side committee member reaches Both families and their own, never the other", () => {
    expect(spacesFor(committee("groom"))).toEqual(["both", "groom"]);
    expect(canReach(committee("groom"), "bride")).toBe(false);
    expect(spacesFor(committee("bride"))).toEqual(["both", "bride"]);
  });
  it("a committee member on both sides reaches all three", () => expect(spacesFor(committee("both"))).toHaveLength(3));
  it("any committee member gets Plan, whatever their other access", () => expect(canReach(committee("bride"), "both")).toBe(true));
});

describe("rules", () => {
  it("a meeting with the other family only in Both families", () => {
    expect(meetingTypeAllowed("both", "other_family")).toBe(true);
    expect(meetingTypeAllowed("bride", "other_family")).toBe(false);
    expect(meetingTypeAllowed("groom", "vendor")).toBe(true);
  });
  it("delete: the creator or the couple", () => {
    expect(canDelete(committee("bride"), "u1", "u1")).toBe(true);
    expect(canDelete(committee("bride"), "u1", "u2")).toBe(false);
    expect(canDelete(committee("bride"), "u1", null)).toBe(false);
    expect(canDelete(couple, "u1", "u2")).toBe(true);
  });
  it("spaces are named by each child's first name, never bride or groom", () => {
    const n = { bride: "Pooja", groom: "Spandan" };
    expect(["both", "bride", "groom"].map((s) => spaceLabel(s as "both", n))).toEqual(["Both families", "Pooja's family", "Spandan's family"]);
  });
});

/* ── through the actions ── */
let weddingId: string, otherWeddingId: string;
const ids: Record<string, string> = {};
const as = (who: string) => { signedIn = people[who]; };
const people: Record<string, Record<string, unknown>> = {};
const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries({ base: "/committee/plan", ...o })) f.set(k, v); return f; };
/** run a form action; its redirect address (where errors show) or "" */
async function post(fn: (fd: FormData) => Promise<unknown>, fd: FormData) {
  try { await fn(fd); return ""; } catch (e) { return decodeURIComponent(String((e as { to?: string }).to ?? e)).replace(/\+/g, " "); }
}
const task = async (id: string) => (await db.select().from(planTasks).where(eq(planTasks.id, id)))[0];
const meetingRow = async (id: string) => (await db.select().from(planMeetings).where(eq(planMeetings.id, id)))[0];

beforeAll(async () => {
  await migrateDb();
  const [w] = await db.insert(weddings).values({ slug: "plan1", brideName: "Pooja", groomName: "Spandan", weddingDate: new Date("2030-11-20") }).returning();
  const [o] = await db.insert(weddings).values({ slug: "plan2", brideName: "X", groomName: "Y", weddingDate: new Date("2030-11-20") }).returning();
  weddingId = w.id; otherWeddingId = o.id;
  const mk = async (key: string, role: "couple" | "committee", side: "bride" | "groom" | "both", wid = weddingId) => {
    const [u] = await db.insert(users).values({ email: `${key}@site.org`, name: key, role, weddingId: wid, side, access: role === "committee" ? { site: "none", guests: "view", print: "none" } : null }).returning();
    ids[key] = u.id;
    people[key] = { id: u.id, role, weddingId: wid, side, access: u.access, isOwner: false };
  };
  await mk("couple", "couple", "both");
  await mk("poojaAunt", "committee", "bride");   // family A, creates things
  await mk("poojaUncle", "committee", "bride");  // family A, didn't create them
  await mk("spandanCousin", "committee", "groom"); // family B
  await mk("otherCouple", "couple", "both", otherWeddingId);
});

/** Pooja's aunt notes a meeting in Pooja's family and a task from it, plus a Both-families task */
async function seed() {
  await db.delete(planTasks); await db.delete(planMeetings);
  as("poojaAunt");
  const m = await post(A.saveMeetingAction, form({ space: "bride", meetingDate: "2026-12-01", title: "Talk with the caterer", type: "vendor", decisions: "Veg only" }));
  const [meeting] = await db.select().from(planMeetings).where(eq(planMeetings.weddingId, weddingId));
  expect(m).toContain("saved=Meeting added");
  expect((await A.addFollowUpAction({ meetingId: meeting.id, title: "Send menu to Mama" })).ok).toBe(true);
  await post(A.saveTaskAction, form({ space: "both", title: "Book the venue" }));
  const all = await db.select().from(planTasks).where(eq(planTasks.weddingId, weddingId));
  return { meeting, follow: all.find((t) => t.title === "Send menu to Mama")!, common: all.find((t) => t.title === "Book the venue")! };
}
beforeEach(() => { signedIn = null; });

describe("tasks and meetings land in the right space", () => {
  it("a follow-up from a meeting is in the meeting's space and linked to it", async () => {
    const { meeting, follow, common } = await seed();
    expect(meeting.side).toBe("bride");
    expect(follow).toMatchObject({ side: "bride", meetingId: meeting.id, createdByUserId: ids.poojaAunt });
    expect(common.side).toBeNull();
  });
  it("Both-families views and counts never include a family's own items", async () => {
    await seed();
    const ctx = { weddingId, userId: ids.couple, access: couple };
    expect((await tasksIn(ctx, "both")).map((t) => t.title)).toEqual(["Book the venue"]);
    expect(await meetingsIn(ctx, "both")).toHaveLength(0);
  });
  it("a meeting 'with the other family' is refused outside Both families, allowed in it", async () => {
    await db.delete(planMeetings);
    as("poojaAunt");
    expect(await post(A.saveMeetingAction, form({ space: "bride", meetingDate: "2026-12-02", title: "Meet Spandan's parents", type: "other_family" }))).toContain("goes in Both families");
    expect(await post(A.saveMeetingAction, form({ space: "both", meetingDate: "2026-12-02", title: "Meet Spandan's parents", type: "other_family" }))).toContain("saved=");
    expect((await db.select().from(planMeetings)).map((m) => m.side)).toEqual([null]);
  });
  it("a task can't be linked to a meeting in another space", async () => {
    const { meeting } = await seed();
    as("couple");
    expect(await post(A.saveTaskAction, form({ space: "both", title: "Linked wrongly", meetingId: meeting.id }))).toContain("different space");
  });
  it("deleting a meeting keeps its tasks, just unlinked", async () => {
    const { meeting, follow } = await seed();
    as("poojaAunt");
    expect((await A.deleteMeetingAction({ id: meeting.id })).ok).toBe(true);
    expect(await meetingRow(meeting.id)).toBeUndefined();
    expect((await task(follow.id)).meetingId).toBeNull();
  });
  it("a committee member ticks a task done (and back)", async () => {
    const { common } = await seed();
    as("spandanCousin");
    expect((await A.setTaskDoneAction({ id: common.id, done: true })).ok).toBe(true);
    expect((await task(common.id)).done).toBe(true);
    expect((await task(common.id)).doneAt).toBeTruthy();
    expect((await A.setTaskDoneAction({ id: common.id, done: false })).ok).toBe(true);
  });
  it("suggested tasks: only while Both families is empty", async () => {
    await db.delete(planTasks); await db.delete(planMeetings);
    as("spandanCousin");
    expect((await A.addStarterTasksAction({})).ok).toBe(true);
    const both = await db.select().from(planTasks).where(and(eq(planTasks.weddingId, weddingId)));
    expect(both).toHaveLength(STARTER_TASKS.length);
    expect(both.every((t) => t.side === null && t.dueDate === null)).toBe(true);
    expect((await A.addStarterTasksAction({})).ok).toBe(false);
  });
});

describe("should be refused", () => {
  it("family B can't see, tick, edit, follow up on or delete family A's task or meeting", async () => {
    const { meeting, follow } = await seed();
    const before = { t: await task(follow.id), m: await meetingRow(meeting.id) };
    as("spandanCousin");
    const ctx = { weddingId, userId: ids.spandanCousin, access: committee("groom") };
    expect(await tasksIn(ctx, "bride")).toEqual([]);
    expect(await meetingsIn(ctx, "bride")).toEqual([]);
    expect(await A.setTaskDoneAction({ id: follow.id, done: true })).toMatchObject({ ok: false, error: expect.stringContaining("couldn't find") });
    expect((await A.deleteTaskAction({ id: follow.id })).ok).toBe(false);
    expect((await A.deleteMeetingAction({ id: meeting.id })).ok).toBe(false);
    expect((await A.addFollowUpAction({ meetingId: meeting.id, title: "sneaky" })).ok).toBe(false);
    expect(await post(A.saveTaskAction, form({ id: follow.id, space: "groom", title: "Changed" }))).toContain("error=");
    expect(await post(A.saveMeetingAction, form({ id: meeting.id, space: "groom", meetingDate: "2026-12-01", title: "Changed", type: "family" }))).toContain("error=");
    // and can't add to family A's space either
    expect(await post(A.saveTaskAction, form({ space: "bride", title: "Into their space" }))).toContain("error=");
    expect(await post(A.saveMeetingAction, form({ space: "bride", meetingDate: "2026-12-01", title: "Into their space", type: "family" }))).toContain("error=");
    expect({ t: await task(follow.id), m: await meetingRow(meeting.id) }).toEqual(before);
    expect(await db.select().from(planTasks).where(eq(planTasks.title, "Into their space"))).toHaveLength(0);
  });
  it("a committee member who didn't create an item can't delete it; its creator and the couple can", async () => {
    const { follow, common, meeting } = await seed();
    as("poojaUncle");
    expect(await A.deleteTaskAction({ id: follow.id })).toMatchObject({ ok: false, error: expect.stringContaining("Only the person who added this") });
    expect((await A.deleteMeetingAction({ id: meeting.id })).ok).toBe(false);
    as("spandanCousin");
    expect((await A.deleteTaskAction({ id: common.id })).ok).toBe(false);
    expect(await task(common.id)).toBeTruthy();
    as("couple");
    expect((await A.deleteTaskAction({ id: common.id })).ok).toBe(true);
    as("poojaAunt");
    expect((await A.deleteTaskAction({ id: follow.id })).ok).toBe(true);
  });
  it("another wedding's couple can't touch anything", async () => {
    const { follow, meeting } = await seed();
    as("otherCouple");
    expect((await A.setTaskDoneAction({ id: follow.id, done: true })).ok).toBe(false);
    expect((await A.deleteTaskAction({ id: follow.id })).ok).toBe(false);
    expect((await A.deleteMeetingAction({ id: meeting.id })).ok).toBe(false);
    expect(await post(A.saveTaskAction, form({ id: follow.id, title: "Mine now" }))).toContain("error=");
    expect((await task(follow.id)).title).toBe("Send menu to Mama");
  });
  it("an owner must be someone who can see the space", async () => {
    await seed();
    as("couple");
    expect(await post(A.saveTaskAction, form({ space: "bride", title: "For Spandan's cousin", ownerUserId: ids.spandanCousin }))).toContain("Pick someone who can see this space");
    expect(await post(A.saveTaskAction, form({ space: "bride", title: "For the aunt", ownerUserId: ids.poojaAunt }))).toContain("saved=");
  });
  it("signed out: the actions send you to sign in", async () => {
    signedIn = null;
    expect(await post(A.saveTaskAction, form({ space: "both", title: "x" }))).toBe("/signin");
  });
});
