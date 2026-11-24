"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { sendHelpRequest } from "@/lib/email/mailer";
import { rateLimit, visitorIp } from "@/lib/auth/ratelimit";
import { GUEST_TOPICS } from "@/lib/core/help";

const schema = z.object({
  name: z.string().trim().min(1, "Please add your name.").max(80),
  email: z.string().trim().toLowerCase().email("Please add an email we can reply to.").max(254),
  topic: z.enum(GUEST_TOPICS),
  message: z.string().trim().min(5, "Tell us a little more.").max(3000),
  page: z.string().max(300).optional(),
  /** left empty by people; bots fill every box */
  website: z.string().max(0).optional(),
});

type FeedbackResult = { ok: true; replyTo: string } | { ok: false; error: string };

/** "Questions or feedback?" at the foot of an invitation: anyone can write, to our inbox. */
export async function sendGuestFeedbackAction(input: unknown): Promise<FeedbackResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const bot = parsed.error.issues.some((i) => i.path[0] === "website");
    // a bot gets a quiet "sent" and nothing goes anywhere
    if (bot) return { ok: true, replyTo: "" };
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const ip = visitorIp(await headers());
  if (!await rateLimit(`feedback-ip:${ip}`, { max: 4, windowMs: 60 * 60_000 }))
    return { ok: false, error: "You've sent a few messages already — we'll be in touch soon." };
  const d = parsed.data;
  // which invitation they were reading (the address only, never the private code)
  const page = (d.page ?? "").replace(/([?&])(k|invite)=[^&]*/g, "$1$2=…");
  try {
    await sendHelpRequest({ name: d.name, email: d.email, topic: `Guest · ${d.topic}`, message: d.message, page, wedding: null, signedInAs: null });
  } catch {
    return { ok: false, error: "We couldn't send that just now. Please try again in a minute." };
  }
  return { ok: true, replyTo: d.email };
}
