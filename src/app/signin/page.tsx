import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signIn } from "@/auth";
import { ROLE_HOME, type Role } from "@/lib/auth/authz";
import { BRAND } from "@/lib/core/brand";
import { signInWasLimited } from "@/lib/auth/signin-limits";
import { visitorIp } from "@/lib/auth/ratelimit";
import { headers } from "next/headers";
import { BrandLogo } from "@/components/BrandLogo";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; wait?: string }>;
}) {
  const { sent, error, wait } = await searchParams;

  // Already signed in — including someone re-opening a link they already used.
  // Showing them the form is what made this feel like a loop.
  const session = await auth();
  const role = (session?.user as { role?: Role } | undefined)?.role;
  if (role) redirect(ROLE_HOME[role]);

  async function requestLink(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim();
    try {
      // /go reads the new session and forwards to the right dashboard. Without
      // this the link's callbackUrl defaults to /signin — straight back here.
      await signIn("nodemailer", { email, redirect: false, redirectTo: "/go" });
    } catch (err) {
      // The UI stays deliberately vague — revealing which addresses are provisioned
      // would turn this form into an account-enumeration oracle. The server log is
      // not vague, so a genuine mail outage is still diagnosable.
      console.error("[signin] sign-in mail failed:", err instanceof Error ? err.message : err);
    }
    // asked too often? (counted the same for every address, so this reveals nothing)
    if (await signInWasLimited(email, visitorIp(await headers()))) redirect("/signin?wait=1");
    redirect("/signin?sent=1");
  }

  return (
    <main className="portal-page flex items-center justify-center p-6">
      <div className="portal-panel w-full max-w-md p-7 md:p-9">
        <Link href="/" className="inline-block text-neutral-900" aria-label={`${BRAND} home`}><BrandLogo height={36} label={BRAND} /></Link>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-500">Couples, planners and family — use the email your wedding is set up with. We&apos;ll send a single-use link, no password.</p>
        {wait && !sent ? (
          <p className="mt-6 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950" role="alert">
            Please wait a few minutes before asking for another link. If one is already on its way, check your
            inbox and spam folder.
          </p>
        ) : error && !sent ? (
          <p className="mt-6 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950" role="alert">
            {error === "Verification"
              ? <>That link has already been used, or it expired. Sign-in links work once — enter your email and we&apos;ll send a fresh one.</>
              : <>We couldn&apos;t send a sign-in link just now. If you&apos;ve asked for a few already, please wait a few minutes before asking for another.</>}
          </p>
        ) : null}
        {sent ? (
          <p className="mt-6 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950">
            If that address is on the team, a sign-in link is on its way. Check your email.
          </p>
        ) : (
          <form action={requestLink} className="mt-6 space-y-4">
            <label className="block">
              <span className="portal-eyebrow">Email address</span>
            <input
              type="email"
              name="email"
              required
              placeholder="you@example.com"
              className="portal-input mt-2"
            />
            </label>
            <button
              type="submit"
              className="portal-button w-full"
            >
              Email me a sign-in link
            </button>
          </form>
        )}
        <p className="mt-6 text-center text-xs text-neutral-500">
          New here? <Link href="/start" className="underline underline-offset-4">Create your wedding site</Link> — it takes two minutes.
        </p>
      </div>
    </main>
  );
}
