import Link from "next/link";
import { findAction, RESET_LABELS } from "@/lib/account";
import type { ResetScope } from "@/db/schema";
import { confirmAccountAction } from "@/app/couple/danger/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Confirm", robots: { index: false } };

const PROBLEM = {
  invalid: { title: "This link doesn't work.", body: "It may have been copied incompletely, or the request was replaced by a newer one. Ask again from your dashboard." },
  used: { title: "This link has already been used.", body: "Each confirmation link works once. If you still need to make a change, ask again from your dashboard." },
  expired: { title: "This link has expired.", body: "Confirmation links last 30 minutes. Ask again from your dashboard to get a fresh one." },
} as const;

/* Opening the emailed link only shows this page; nothing changes until the
   button is pressed. Mail scanners that open links can't trigger it. */
export default async function ConfirmPage({ params, searchParams }: {
  params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const found = error && error in PROBLEM ? { ok: false as const, reason: error as keyof typeof PROBLEM } : await findAction(token);

  if (!found.ok) {
    const p = PROBLEM[found.reason];
    return (
      <main data-theme="ivory-editorial" className="themed flex min-h-svh flex-col items-center justify-center px-6 text-center">
        <p className="kicker rise rise-1">Confirmation</p>
        <h1 className="font-display rise rise-2 mt-6 max-w-xl text-4xl tracking-tight">{p.title}</h1>
        <p className="rise rise-3 mt-6 max-w-md text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>{p.body}</p>
        <Link href="/couple/site#danger" className="cta-ghost rise rise-3 mt-8">Go to my dashboard</Link>
      </main>
    );
  }

  const a = found.action;
  const items = a.kind === "delete"
    ? [
        "Your wedding website and its link (/w/" + a.slug + ")",
        "Every celebration, guest, invitation and RSVP",
        "All gallery photos",
        "Every login for this wedding, including yours (" + a.email + ")",
      ]
    : (Object.keys(RESET_LABELS) as (keyof ResetScope)[]).filter((k) => a.scope?.[k]).map((k) => RESET_LABELS[k]);

  return (
    <main data-theme="ivory-editorial" className="themed flex min-h-svh flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg">
        <p className="kicker rise rise-1 text-center">{a.coupleNames}</p>
        <h1 className="font-display rise rise-2 mt-5 text-center text-4xl tracking-tight">
          {a.kind === "delete" ? "Delete your wedding website?" : "Reset your wedding website?"}
        </h1>
        <div className="rise rise-3 mt-8 rounded-xl border p-5 text-sm leading-relaxed" style={{ borderColor: "#e8c4bf", background: "#fdf3f1", color: "#5c1d17" }}>
          <p className="font-semibold">This will permanently erase:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">{items.map((i) => <li key={i}>{i}</li>)}</ul>
          {a.kind === "reset" && (
            <p className="mt-3">Your login, your names, wedding date, city and web address stay as they are.</p>
          )}
          <p className="mt-3 font-semibold">This can&apos;t be undone.</p>
        </div>
        <form action={confirmAccountAction} className="rise rise-3 mt-6 flex flex-wrap items-center justify-center gap-3">
          <input type="hidden" name="token" value={token} />
          <button type="submit" className="cta" style={{ background: "#9b1c1c", color: "#fff" }}>
            {a.kind === "delete" ? "Yes, delete everything" : "Yes, reset these"}
          </button>
          <Link href="/couple/site" className="cta-ghost">Keep everything</Link>
        </form>
      </div>
    </main>
  );
}
