import QRCode from "qrcode";
import { CopyButton } from "./CopyButton";
import { appOrigin } from "@/lib/origin";
import { sharePath } from "@/lib/share";

/** The one thing a couple actually needs from the dashboard: the link. */
export async function ShareCard({ slug, coupleNames, weddingDateText, compact = false, family, shareKey, openReplies, renew }: {
  slug: string; coupleNames: string; weddingDateText: string; compact?: boolean;
  /** each family shares the site in its own look */
  family: "bride" | "groom";
  /** the code that makes this family's link private */
  shareKey: string | null;
  /** may people who are not on the guest list reply from this link? */
  openReplies: boolean;
  /** a form that swaps the code for a new one (shown to those who may) */
  renew?: React.ReactNode;
}) {
  const origin = await appOrigin();
  const url = `${origin}${sharePath(slug, family, shareKey)}`;
  const message = `${coupleNames} are getting married on ${weddingDateText} — and you're invited! 🎉\n\n${openReplies ? "See the celebrations and RSVP here" : "See the celebrations here"}: ${url}`;
  const wa = `https://wa.me/?text=${encodeURIComponent(message)}`;
  const qr = await QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#1c1917", light: "#ffffff00" } });

  return (
    <section id="share" className="portal-panel p-6">
      <div className="flex flex-col gap-6 md:flex-row md:items-center">
        <div className="min-w-0 flex-1">
          <p className="portal-eyebrow">Share your invitation</p>
          <h2 className="mt-1 font-semibold">One link. Every celebration, every RSVP.</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Send it on WhatsApp, put it in a family group, print the QR on the card. Guests tap and see the celebrations — no app, no account.
            The link is private: only people who have it (with its code) can open the invitation; anyone else sees just your names and the date.
          </p>
          <div className="mt-4 flex items-stretch">
            <input readOnly value={url} className="portal-input min-w-0 flex-1 rounded-r-none font-mono text-xs" />
            <CopyButton text={url} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={wa} target="_blank" rel="noreferrer" className="portal-button">Share on WhatsApp</a>
            <a href={url} target="_blank" rel="noreferrer" className="portal-button-secondary">Open site ↗</a>
            {openReplies && <a href={`${origin}${sharePath(slug, family, shareKey, "/rsvp")}`} target="_blank" rel="noreferrer" className="portal-button-secondary">Open RSVP form ↗</a>}
          </div>
          {renew && <div className="mt-4 border-t border-neutral-100 pt-3">{renew}</div>}
        </div>
        {!compact && (
          <div className="shrink-0 self-center rounded-xl border border-neutral-200 bg-white p-3" title="Scan to open the invitation">
            <div className="h-36 w-36 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} />
            <p className="mt-2 text-center text-[10px] uppercase tracking-[0.2em] text-neutral-400">scan me</p>
          </div>
        )}
      </div>
    </section>
  );
}
