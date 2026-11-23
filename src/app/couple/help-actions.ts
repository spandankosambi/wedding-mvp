"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db/client";
import { users, weddings } from "@/db/schema";
import { sendHelpRequest } from "@/lib/mailer";
import { rateLimit } from "@/lib/ratelimit";
import { HELP_TOPICS } from "@/lib/help";

const schema = z.object({
  name: z.string().trim().min(1, "Please add your name.").max(80),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email("That email doesn't look right.").max(254)]),
  topic: z.enum(HELP_TOPICS),
  message: z.string().trim().min(5, "Tell us a little more.").max(3000),
  page: z.string().max(300).optional(),
});

type HelpResult = { ok: true; replyTo: string } | { ok: false; error: string };

/** The "Need help?" form: sends the message to our inbox, with reply-to set to the person. */
export async function sendHelpAction(input: unknown): Promise<HelpResult> {
  const { auth } = await import("@/auth");
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return { ok: false, error: "Please sign in again, then send your message." };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const ip = ((await headers()).get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (!rateLimit(`help:${userId}`, { max: 5, windowMs: 60 * 60_000 }) || !rateLimit(`help-ip:${ip}`, { max: 10, windowMs: 60 * 60_000 }))
    return { ok: false, error: "You've sent a few messages already — we'll be in touch soon. Try again in an hour if it's urgent." };

  const [u] = await db.select({ email: users.email, weddingId: users.weddingId }).from(users).where(eq(users.id, userId));
  const [w] = u?.weddingId ? await db.select({ brideName: weddings.brideName, groomName: weddings.groomName, slug: weddings.slug }).from(weddings).where(eq(weddings.id, u.weddingId)) : [];
  const d = parsed.data;
  const replyTo = d.email || u?.email || "";
  if (!replyTo) return { ok: false, error: "Please add an email we can reply to." };
  try {
    await sendHelpRequest({
      name: d.name, email: replyTo, topic: d.topic, message: d.message, page: d.page ?? "",
      wedding: w ? `${w.brideName} & ${w.groomName} (/w/${w.slug})` : null, signedInAs: u?.email ?? null,
    });
  } catch {
    return { ok: false, error: "We couldn't send that just now. Please try again in a minute." };
  }
  return { ok: true, replyTo };
}
