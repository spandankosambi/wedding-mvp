import { z } from "zod";
import type { SiteDecor } from "@/db/schema";

/** A family's design touches on its wedding site. Browser-safe. */
export const REVEALS = ["none", "envelope", "doors", "curtain"] as const;
export const MOTIONS = ["none", "gentle", "lively"] as const;
export const SCENES = ["none", "night", "garden", "palace"] as const;

export const MOTION_LABELS: Record<(typeof MOTIONS)[number], [string, string]> = {
  none: ["Still", "Nothing moves; best for very slow phones"],
  gentle: ["Gentle", "Sections fade in as guests scroll"],
  lively: ["Lively", "Everything arrives with a flourish; colours shift between sections"],
};
export const SCENE_LABELS: Record<(typeof SCENES)[number], [string, string]> = {
  none: ["No scene", "Just your theme"],
  night: ["Night sky", "Twinkling stars, a crescent moon, drifting clouds and lanterns"],
  garden: ["Garden", "Swaying vines, fluttering leaves and butterflies"],
  palace: ["Palace", "Arches and domes at dusk with flickering lamps"],
};
export const FALLING = ["petals", "marigold", "sparkles", "diyas", "none"] as const;
export const DIVIDERS = ["theme", "lotus", "paisley", "diamonds"] as const;

export const REVEAL_LABELS: Record<(typeof REVEALS)[number], [string, string]> = {
  none: ["Straight to the site", "No opening screen"],
  envelope: ["Sealed envelope", "Guests tap the seal; the envelope opens"],
  doors: ["Palace doors", "Two doors part to show the invitation"],
  curtain: ["Paper-cut curtain", "Scalloped curtains draw back, layer by layer"],
};
export const FALLING_LABELS: Record<(typeof FALLING)[number], string> = {
  petals: "Rose petals", marigold: "Marigolds", sparkles: "Sparkles", diyas: "Floating diyas", none: "Nothing",
};
export const DIVIDER_LABELS: Record<(typeof DIVIDERS)[number], string> = {
  theme: "Your theme's own", lotus: "Lotus", paisley: "Paisley", diamonds: "Diamonds",
};

export const decorSchema = z.object({
  motion: z.enum(MOTIONS).default("gentle"),
  scene: z.enum(SCENES).default("none"),
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

/* ── Things to know ── */
export const MAX_KNOW = 6;
export const KNOW_SUGGESTIONS = ["Weather", "Parking", "Dress code", "Gifts", "Helpers on the day", "Kids"] as const;
export const knowSchema = z.array(z.object({
  title: z.string().trim().min(1).max(40),
  text: z.string().trim().min(1).max(280),
})).max(MAX_KNOW);

/* ── Background music ── */
export const MAX_MUSIC_BYTES = 4 * 1024 * 1024; // the host accepts uploads up to about 4.5 MB
export const MUSIC_TYPES = ["audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/aac"] as const;
