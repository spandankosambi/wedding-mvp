import Link from "next/link";
import { Ornament } from "@/themes/ornaments";

export const metadata = { title: "Wedding website deleted", robots: { index: false } };

export default function DeletedPage() {
  return (
    <main data-theme="ivory-editorial" className="themed flex min-h-svh flex-col items-center justify-center px-6 text-center">
      <p className="kicker rise rise-1">Done</p>
      <h1 className="font-display rise rise-2 mt-6 max-w-xl text-4xl tracking-tight md:text-5xl">Your wedding website has been deleted.</h1>
      <p className="rise rise-3 mt-6 max-w-md text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
        The site, its guest list, RSVPs, photos and every login for it are gone, and you&apos;ve been signed out.
        Wishing you both a wonderful wedding.
      </p>
      <div className="rise rise-3 mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className="cta-ghost">Home</Link>
        <Link href="/start" className="cta-ghost">Create a new site</Link>
      </div>
      <div className="rise rise-3 mt-10"><Ornament theme="ivory-editorial" slot="hero" /></div>
    </main>
  );
}
