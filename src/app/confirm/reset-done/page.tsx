import Link from "next/link";
import { Ornament } from "@/themes/ornaments";

export const metadata = { title: "Reset done", robots: { index: false } };

export default function ResetDonePage() {
  return (
    <main data-theme="ivory-editorial" className="themed flex min-h-svh flex-col items-center justify-center px-6 text-center">
      <p className="kicker rise rise-1">Done</p>
      <h1 className="font-display rise rise-2 mt-6 max-w-xl text-4xl tracking-tight md:text-5xl">Your wedding website has been reset.</h1>
      <p className="rise rise-3 mt-6 max-w-md text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
        The parts you chose are cleared. Everything else is as you left it.
      </p>
      <Link href="/couple/site" className="cta rise rise-3 mt-8">Open my dashboard</Link>
      <div className="rise rise-3 mt-10"><Ornament theme="ivory-editorial" slot="hero" /></div>
    </main>
  );
}
