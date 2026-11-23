import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { AREA_LABELS, LEVEL_LABELS, REACH_LABELS, accessFor, type Grant } from "@/lib/auth/access";
import type { SideNames } from "@/lib/site/side-names";

/* The people who can sign in to one wedding. The couple add family and
   friends, put each on a side and choose what they may do. Rules:
   - nobody changes or removes themselves, or the person who set the wedding up;
   - only that person (the owner) adds, changes or removes a "couple" login;
   - an email address has one login, for one wedding. */

const MAX_PEOPLE = 40;
type Result = { ok: true } | { ok: false; error: string };
type Actor = { userId: string; owner: boolean };

const level = z.enum(["none", "view", "full"]);
const personSchema = z.object({
  name: z.string().trim().max(80).default(""),
  role: z.enum(["couple", "committee"]),
  side: z.enum(["bride", "groom", "both"]),
  site: level, guests: level, print: z.enum(["none", "full"]),
});
const emailSchema = z.string().trim().toLowerCase().email().max(254);
type PersonInput = z.infer<typeof personSchema>;

export type Person = {
  id: string; email: string; name: string; role: "couple" | "committee"; isOwner: boolean;
  side: "bride" | "groom" | "both"; site: Grant["site"]; guests: Grant["guests"]; print: Grant["print"]; signedIn: boolean;
};

export async function listPeople(weddingId: string): Promise<Person[]> {
  const rows = await db.select().from(users).where(eq(users.weddingId, weddingId));
  return rows
    .filter((u) => u.role !== "admin")
    .map((u) => {
      const a = accessFor(u);
      return {
        id: u.id, email: u.email, name: u.name ?? "", role: u.role as "couple" | "committee", isOwner: u.isOwner,
        side: a.side, site: a.site, guests: a.guests, print: a.print as Grant["print"], signedIn: !!u.emailVerified,
      };
    })
    .sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || Number(b.role === "couple") - Number(a.role === "couple") || a.email.localeCompare(b.email));
}

/** A sentence for the email and the list: "Pooja's side: the dashboard and overview, Guest list (full access)". */
export function describe(p: Pick<Person, "role" | "side" | "site" | "guests" | "print">, names?: SideNames): string {
  if (p.role === "couple") return "everything, on both sides";
  const parts = (["site", "guests", "print"] as const).filter((a) => p[a] !== "none")
    .map((a) => `${AREA_LABELS[a]} (${a === "print" ? "can print" : LEVEL_LABELS[p[a]].toLowerCase()})`);
  const reach = names && p.side !== "both" ? `${names[p.side]}'s side` : REACH_LABELS[p.side];
  return `${reach}: the dashboard and overview${parts.length ? `, ${parts.join(", ")}` : ""}`;
}

const row = (d: PersonInput) =>
  d.role === "couple"
    ? { name: d.name || null, role: "couple" as const, side: "both" as const, access: null }
    : { name: d.name || null, role: "committee" as const, side: d.side, access: { site: d.site, guests: d.guests, print: d.print } };

export async function addPerson(weddingId: string, actor: Actor, emailRaw: unknown, input: unknown): Promise<Result & { person?: Person }> {
  const email = emailSchema.safeParse(emailRaw);
  if (!email.success) return { ok: false, error: "Enter a valid email address." };
  const parsed = personSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the role, side and access." };
  if (parsed.data.role === "couple" && !actor.owner) return { ok: false, error: "Only the person who set this wedding up can add the bride or groom." };
  const [existing] = await db.select().from(users).where(eq(users.email, email.data));
  if (existing) {
    return { ok: false, error: existing.weddingId === weddingId ? "That email already has access to this wedding." : "That email already has a login for another wedding. Use a different address." };
  }
  if ((await db.select({ id: users.id }).from(users).where(eq(users.weddingId, weddingId))).length >= MAX_PEOPLE) {
    return { ok: false, error: `A wedding can have up to ${MAX_PEOPLE} people.` };
  }
  await db.insert(users).values({ email: email.data, weddingId, ...row(parsed.data) });
  const person = (await listPeople(weddingId)).find((p) => p.email === email.data);
  return { ok: true, person };
}

async function target(weddingId: string, actor: Actor, userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!z.string().uuid().safeParse(userId).success) return { ok: false, error: "Person not found." };
  const [u] = await db.select().from(users).where(and(eq(users.id, userId), eq(users.weddingId, weddingId)));
  if (!u || u.role === "admin") return { ok: false, error: "Person not found." };
  if (u.id === actor.userId) return { ok: false, error: "You can't change your own access." };
  if (u.isOwner) return { ok: false, error: "The person who set this wedding up can't be changed or removed." };
  if (u.role === "couple" && !actor.owner) return { ok: false, error: "Only the person who set this wedding up can change the bride or groom." };
  return { ok: true };
}

export async function updatePerson(weddingId: string, actor: Actor, userId: string, input: unknown): Promise<Result> {
  const t = await target(weddingId, actor, userId);
  if (!t.ok) return t;
  const parsed = personSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the role, side and access." };
  if (parsed.data.role === "couple" && !actor.owner) return { ok: false, error: "Only the person who set this wedding up can make someone the bride or groom." };
  await db.update(users).set(row(parsed.data)).where(and(eq(users.id, userId), eq(users.weddingId, weddingId)));
  return { ok: true };
}

/** Anyone may change the name on their own login (and nothing else about it). */
export async function renameSelf(weddingId: string, userId: string, input: unknown): Promise<Result> {
  const parsed = z.string().trim().min(1).max(80).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please enter your name." };
  await db.update(users).set({ name: parsed.data.replace(/\s+/g, " ") }).where(and(eq(users.id, userId), eq(users.weddingId, weddingId)));
  return { ok: true };
}

/** Removes the login; they are signed out everywhere at once. */
export async function removePerson(weddingId: string, actor: Actor, userId: string): Promise<Result> {
  const t = await target(weddingId, actor, userId);
  if (!t.ok) return t;
  await db.delete(users).where(and(eq(users.id, userId), eq(users.weddingId, weddingId)));
  return { ok: true };
}
