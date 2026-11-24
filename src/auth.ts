import NextAuth from "next-auth";
import { headers } from "next/headers";
import Nodemailer from "next-auth/providers/nodemailer";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";
import { isProvisionedStaff } from "@/lib/auth/authz";
import { sendSignInLink, smtpServer } from "@/lib/email/mailer";
import { signInAllowed, SignInLimited } from "@/lib/auth/signin-limits";
import { visitorIp } from "@/lib/auth/ratelimit";
import { env } from "@/config/env";

/** The visitor's IP for this request (sign-in runs inside a page action or the /api/auth route). */
async function requestIp(): Promise<string> {
  try { return visitorIp(await headers()); } catch { return "local"; }
}

// settings only (src/config/env.ts): switching mail provider is a change of settings
const server = smtpServer();
/** Auth.js's own sign-in email, used to send the link once it's allowed */
const standard = Nodemailer({ server, from: env.email.from });
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users as any, accountsTable: accounts as any,
    sessionsTable: sessions as any, verificationTokensTable: verificationTokens as any,
  }),
  providers: [
    Nodemailer({
      server,
      from: env.email.from,
      // every sign-in link is counted against the daily email budget
      sendVerificationRequest: async (params) => {
        await sendSignInLink(params.identifier, params.url, async () => { await standard.sendVerificationRequest(params); });
      },
    }),
  ],
  callbacks: {
    async signIn({ user, email }) {
      // Asking for a sign-in link, from any page or a direct POST to /api/auth.
      // Counted for every address, known or not, so "please wait" never gives
      // away whether an address has an account.
      if (email?.verificationRequest && !await signInAllowed(user.email ?? "", await requestIp())) {
        throw new SignInLimited("too many sign-in links");
      }
      return isProvisionedStaff(user.email);
    },
    async session({ session, user }) {
      // the adapter's session lookup already brings the whole user row (role,
      // wedding, access…); only ask the database again if it somehow didn't
      const row = (user as Partial<typeof users.$inferSelect>).role
        ? (user as typeof users.$inferSelect)
        : (await db.select().from(users).where(eq(users.id, user.id)))[0];
      (session.user as any).role = row?.role;
      (session.user as any).weddingId = row?.weddingId ?? null;
      (session.user as any).side = row?.side ?? "both";
      (session.user as any).access = row?.access ?? null;
      (session.user as any).isOwner = !!row?.isOwner;
      return session;
    },
  },
  // Verification failures (a link already used, or expired) come back to our own
  // sign-in page as ?error=, not Auth.js's unstyled 403 dead end.
  pages: { signIn: "/signin", error: "/signin" },
});
