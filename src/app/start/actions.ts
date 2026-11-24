"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { createWeddingForCouple } from "@/lib/auth/signup";
import { rateLimit, visitorIp } from "@/lib/auth/ratelimit";
import { count, gt } from "drizzle-orm";
import { db } from "@/db/client";
import { weddings } from "@/db/schema";
import { env } from "@/config/env";

export type StartState = { error?: string; values?: Record<string, string> };

export async function startWeddingAction(_prev: StartState, formData: FormData): Promise<StartState> {
  const values = Object.fromEntries(
    ["brideName", "groomName", "you", "weddingDate", "city", "email", "theme"].map((k) => [k, String(formData.get(k) ?? "").trim()]),
  );
  const ip = visitorIp(await headers());
  if (!await rateLimit(`start:${ip}`, { max: 5, windowMs: 10 * 60_000 })) {
    return { error: "A little too fast — give it a few minutes and try again.", values };
  }
  // each try emails a sign-in link to the typed address: at most two a day per address
  const email = values.email.toLowerCase();
  if (email && !await rateLimit(`start-email:${email}`, { max: 2, windowMs: 24 * 60 * 60_000 })) {
    return { error: "We've already sent a sign-in link to that address today. Check its inbox and spam folder, or try again tomorrow.", values };
  }
  // a cap on new sites per hour, so a flood can't use up the day's email
  const [made] = await db.select({ n: count() }).from(weddings).where(gt(weddings.createdAt, new Date(Date.now() - 60 * 60_000)));
  if (Number(made?.n ?? 0) >= env.newSitesPerHour) {
    return { error: "Lots of couples are signing up right now. Please try again in an hour.", values };
  }
  const res = await createWeddingForCouple(values);
  if (!res.ok) return { error: "Please check the details — every field is needed, and the date should be in the future.", values };
  // If the mail can't go out, say so. The couple has just handed us their wedding;
  // telling them to check an inbox nothing was sent to is the worst possible lie,
  // because they have no way to tell it from a slow inbox. (`redirect: false` keeps
  // signIn from throwing a redirect, so anything caught here is a real failure.)
  let mailed = true;
  try {
    await signIn("nodemailer", { email: res.email, redirect: false, redirectTo: "/couple/site" });
  } catch (e) {
    mailed = false;
    console.error("[start] sign-in mail failed for a new wedding:", e instanceof Error ? e.message : e);
  }
  const q = new URLSearchParams({ e: res.email });
  if (!res.created) q.set("existing", "1");
  if (!mailed) q.set("mail", "failed");
  redirect(`/start/sent?${q}`);
}
