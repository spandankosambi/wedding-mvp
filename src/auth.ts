import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";
import { isProvisionedStaff } from "@/lib/auth/authz";
import { recordOutbox, smtpConfigured } from "@/lib/email/mailer";
import { env } from "@/config/env";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users as any, accountsTable: accounts as any,
    sessionsTable: sessions as any, verificationTokensTable: verificationTokens as any,
  }),
  providers: [
    Nodemailer({
      server: { service: "gmail", auth: { user: env.email.smtpUser, pass: env.email.smtpPass } },
      from: env.email.from,
      // no SMTP: record the magic link in the outbox instead of sending
      ...(!smtpConfigured() && {
        sendVerificationRequest: async ({ identifier, url }) => {
          await recordOutbox({ to: identifier, subject: "Sign in", kind: "signin", link: url });
        },
      }),
    }),
  ],
  callbacks: {
    async signIn({ user }) {
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
