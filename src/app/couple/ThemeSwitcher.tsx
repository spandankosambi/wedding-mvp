"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTheme, copyFromPartnerAction } from "./actions";
import { THEMES, THEME_META, type Theme } from "@/themes/catalog";

const SWATCHES = THEMES.map((theme) => ({ theme, ...THEME_META[theme] }));

export function ThemeSwitcher({
  weddingId,
  current,
  slug,
  coupleNames,
  family,
  partnerTheme,
}: {
  weddingId: string;
  current: Theme;
  slug: string;
  coupleNames: string;
  /** whose look this is */
  family: "bride" | "groom";
  /** the other family's theme, to offer "same as your partner" */
  partnerTheme: Theme;
}) {
  const router = useRouter();
  const [active, setActive] = useState<Theme>(current);
  const [pending, startTransition] = useTransition();

  function choose(theme: Theme) {
    if (theme === active || pending) return;
    const prev = active;
    setActive(theme); // optimistic — the swatch highlights instantly
    startTransition(async () => {
      const res = await setTheme({ theme, weddingId, family });
      if (!res.ok) setActive(prev);
      else router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-semibold">{family === "bride" ? "The bride's family's" : "The groom's family's"} look</h2>
          <p className="mt-1 text-sm text-neutral-500">
            One click restyles the site your guests see — their emails and printed cards follow the same palette.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {partnerTheme !== active && (
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(async () => {
                const res = await copyFromPartnerAction({ weddingId, family, part: "theme" });
                if (res.ok) { setActive(partnerTheme); router.refresh(); }
              })}
              className="portal-button-secondary"
            >
              Same as the {family === "bride" ? "groom" : "bride"}&apos;s family ({THEME_META[partnerTheme].label})
            </button>
          )}
          <a
            href={`/w/${slug}?side=${family}`}
            target="_blank"
            className="text-sm text-neutral-600 underline underline-offset-4"
          >
            View this site ↗
          </a>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {SWATCHES.map((s) => {
          const selected = active === s.theme;
          return (
            <button
              key={s.theme}
              type="button"
              onClick={() => choose(s.theme)}
              aria-pressed={selected}
              className={`group relative overflow-hidden rounded-lg border p-5 text-left transition-all ${
                selected
                  ? "border-neutral-900 shadow-[0_0_0_2px_rgba(23,23,23,1)]"
                  : "border-neutral-200 hover:border-neutral-400 hover:shadow-md"
              }`}
              style={{ background: s.bg, color: s.ink }}
            >
              <p
                className="text-3xl leading-tight tracking-tight"
                style={{ fontFamily: `${s.fontVar}, Georgia, serif` }}
              >
                {coupleNames}
              </p>
              <p className="mt-1 text-[11px] uppercase tracking-[0.25em] opacity-70">
                {s.label}
              </p>
              <div className="mt-4 flex items-center justify-between">
                <div className="flex gap-1.5">
                  {s.dots.map((c) => (
                    <span
                      key={c}
                      className="h-4 w-4 rounded-full border border-black/10"
                      style={{ background: c }}
                    />
                  ))}
                </div>
                <span className="text-[11px] opacity-70">
                  {selected ? (pending ? "applying…" : "✓ live") : "preview"}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-neutral-400">{SWATCHES.find((s) => s.theme === active)?.tagline}</p>
    </section>
  );
}
