import { SectionHeader } from "./SectionHeader";
import { fmtEventDate, fmtEventTime } from "@/lib/format";
import { sideLabel, type Side } from "@/lib/sides";
import type { SideNames } from "@/lib/side-names";
import { icon, iconOf } from "@/lib/invitation/decor";
import { MotifSvg } from "@/components/MotifSvg";
import { iconPng } from "@/lib/icon-png";

/** The family's uploaded icon, drawn in the theme's accent colour. */
function ownIcon(e: { icon?: string | null; iconImage?: string | null }) {
  const png = e.icon === "custom" ? iconPng(e.iconImage) : null;
  if (!png) return null;
  const mask = `url(${png}) center / contain no-repeat`;
  return <span className="event-icon event-icon-own" data-own-icon style={{ WebkitMask: mask, mask }} />;
}

type EventRow = {
  id: string;
  name: string;
  icon?: string | null;
  iconImage?: string | null;
  startsAt: Date;
  venueName: string;
  address: string;
  mapUrl: string | null;
  dressCode: string | null;
  description?: string | null;
  side?: Side;
};

export function EventTimeline({ theme: _theme, events, no = "02", icons = false, names }: { theme: string; events: EventRow[]; no?: string; icons?: boolean; names?: SideNames }) {
  return (
    <section className="mx-auto max-w-5xl px-6 py-24 md:py-32">
      <SectionHeader no={no} title="The Celebrations" />
      <ol>
        {events.map((e, i) => (
          <li
            key={e.id}
            /* first row skips its rule: the header's taper already closes that gap */
            className={`reveal grid gap-4 py-10 md:grid-cols-12 md:gap-8 ${i > 0 ? "rule-grow" : ""}`}
            style={{ "--rd": `${(i % 3) * 0.12}s` } as React.CSSProperties}
          >
            <span
              className="font-display text-2xl md:col-span-1 md:text-3xl"
              style={{ color: "var(--ink-soft)", opacity: icons ? 1 : 0.55 }}
            >
              {icons
                ? <span data-testid="event-icon">{ownIcon(e) ?? <MotifSvg m={icon(iconOf(e))} className="event-icon" />}</span>
                : String(i + 1).padStart(2, "0")}
            </span>
            <div className="md:col-span-6">
              <h3 className="font-display text-4xl tracking-tight md:text-5xl">{e.name}</h3>
              {e.side && sideLabel(e.side, names) && (
                <p className="kicker mt-3" style={{ color: "var(--accent)" }}>{sideLabel(e.side, names)}</p>
              )}
              <p className="kicker mt-4">
                {fmtEventDate(e.startsAt)} · {fmtEventTime(e.startsAt)}
              </p>
              {e.description && (
                <p className="mt-4 max-w-md text-sm leading-relaxed" style={{ color: "var(--ink-soft)" }}>
                  {e.description}
                </p>
              )}
            </div>
            <div className="md:col-span-5 md:pt-2">
              <p className="text-base font-medium">{e.venueName}</p>
              <p className="mt-1 text-sm" style={{ color: "var(--ink-soft)" }}>
                {e.address}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                {e.mapUrl && (
                  <a
                    href={e.mapUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm underline underline-offset-4"
                    style={{ color: "var(--accent-2)" }}
                  >
                    View map ↗
                  </a>
                )}
                {e.dressCode && (
                  <span
                    className="kicker rounded-full px-3 py-1.5"
                    style={{ border: "1px solid var(--hairline)", letterSpacing: "0.22em" }}
                  >
                    Dress · {e.dressCode}
                  </span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
