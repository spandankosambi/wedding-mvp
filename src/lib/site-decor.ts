import { z } from "zod";
import type { SiteDecor } from "@/db/schema";

/** A family's design touches on its wedding site. Browser-safe. */
export const REVEALS = ["none", "envelope", "doors"] as const;
export const FALLING = ["petals", "marigold", "sparkles", "diyas", "none"] as const;
export const DIVIDERS = ["theme", "lotus", "paisley", "diamonds"] as const;

export const REVEAL_LABELS: Record<(typeof REVEALS)[number], [string, string]> = {
  none: ["Straight to the site", "No opening screen"],
  envelope: ["Sealed envelope", "Guests tap the seal; the envelope opens"],
  doors: ["Palace doors", "Two doors part to show the invitation"],
};
export const FALLING_LABELS: Record<(typeof FALLING)[number], string> = {
  petals: "Rose petals", marigold: "Marigolds", sparkles: "Sparkles", diyas: "Floating diyas", none: "Nothing",
};
export const DIVIDER_LABELS: Record<(typeof DIVIDERS)[number], string> = {
  theme: "Your theme's own", lotus: "Lotus", paisley: "Paisley", diamonds: "Diamonds",
};

export const decorSchema = z.object({
  reveal: z.enum(REVEALS).default("none"),
  falling: z.enum(FALLING).default("petals"),
  toran: z.boolean().default(false),
  corners: z.boolean().default(false),
  divider: z.enum(DIVIDERS).default("theme"),
  icons: z.boolean().default(false),
});
export type Decor = z.infer<typeof decorSchema>;

export const DEFAULT_DECOR: Decor = decorSchema.parse({});

/** The family's choices, with the defaults for anything not chosen yet. */
export function decorOf(look: { decor?: SiteDecor | null } | null | undefined): Decor {
  const p = decorSchema.safeParse(look?.decor ?? {});
  return p.success ? p.data : DEFAULT_DECOR;
}
