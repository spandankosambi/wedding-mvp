import { pgTable, pgEnum, text, integer, boolean, jsonb, timestamp, uuid, primaryKey, uniqueIndex } from "drizzle-orm/pg-core";

export const themeEnum = pgEnum("theme", ["ivory-editorial", "raj-mahal", "gulaab-rococo", "mehfil-noor", "pichwai-bagh", "neel-chhapa"]);
export const sideEnum = pgEnum("side", ["bride", "groom", "both"]);
export const roleEnum = pgEnum("role", ["admin", "couple", "committee"]);
export const rsvpStatusEnum = pgEnum("rsvp_status", ["attending", "declined"]);
export const ageGroupEnum = pgEnum("age_group", ["adult", "child"]);
export const emailTypeEnum = pgEnum("email_type", ["invite", "reminder", "resend"]);
export const familySourceEnum = pgEnum("family_source", ["committee", "import", "guest"]);

/** Travel & stay copy the couple writes in their editor — prose, not relational data. */
export type TravelInfo = {
  /** `common`: shown by both families (kept in step on both sides) */
  stays: { name: string; note: string; url?: string; common?: boolean }[];
  gettingThere: string;
};

/** The couple's own photos for the Gallery section, stored in Vercel Blob.
    `null` (every wedding before this existed) means: shown, no photos yet. */
export type GalleryPhoto = { url: string; pathname: string; width: number; height: number };
export type GalleryInfo = { enabled: boolean; photos: GalleryPhoto[] };
/** Extra per-guest columns the couple or committee adds (Stay, Room no.…). */
export type GuestColumn = { id: string; label: string };

export const weddings = pgTable("weddings", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  brideName: text("bride_name").notNull(),
  groomName: text("groom_name").notNull(),
  theme: themeEnum("theme").notNull().default("ivory-editorial"),
  weddingDate: timestamp("wedding_date", { withTimezone: true }).notNull(),
  heroTagline: text("hero_tagline"),
  story: text("story"),
  city: text("city"),
  brideParents: text("bride_parents"),
  groomParents: text("groom_parents"),
  hashtag: text("hashtag"),
  contactPhone: text("contact_phone"),
  rsvpOpen: boolean("rsvp_open").notNull().default(true),
  rsvpDeadline: timestamp("rsvp_deadline", { withTimezone: true }),
  travel: jsonb("travel").$type<TravelInfo>(),
  gallery: jsonb("gallery").$type<GalleryInfo>(),
  guestColumns: jsonb("guest_columns").$type<GuestColumn[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Each family's own look for the one wedding site: the bride's family and
 * the groom's print and present their invitations differently. A guest sees
 * their family's side; the plain site address shows the bride's. Everything
 * shared (names, date, city, parents, events) stays on `weddings`; the
 * matching columns there are the starting values a new side is created from.
 * Each family also opens and closes its own RSVPs.
 */
export const weddingSides = pgTable("wedding_sides", {
  weddingId: uuid("wedding_id").notNull().references(() => weddings.id, { onDelete: "cascade" }),
  side: sideEnum("side").notNull(), // "bride" or "groom" only
  theme: themeEnum("theme").notNull().default("ivory-editorial"),
  heroTagline: text("hero_tagline"),
  story: text("story"),
  hashtag: text("hashtag"),
  contactPhone: text("contact_phone"),
  travel: jsonb("travel").$type<TravelInfo>(),
  gallery: jsonb("gallery").$type<GalleryInfo>(),
  rsvpOpen: boolean("rsvp_open").notNull().default(true),
  rsvpDeadline: timestamp("rsvp_deadline", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.weddingId, t.side] })]);

export const events = pgTable("events", {
  id: uuid("id").defaultRandom().primaryKey(),
  weddingId: uuid("wedding_id").notNull().references(() => weddings.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  venueName: text("venue_name").notNull(),
  address: text("address").notNull(),
  mapUrl: text("map_url"),
  dressCode: text("dress_code"),
  description: text("description"),
  isPublished: boolean("is_published").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  /** "both" = common to bride's and groom's families; otherwise this side's
      own version (e.g. the bride's Haldi at her home), invited by side. */
  side: sideEnum("side").notNull().default("both"),
});

export const families = pgTable("families", {
  id: uuid("id").defaultRandom().primaryKey(),
  weddingId: uuid("wedding_id").notNull().references(() => weddings.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  side: sideEnum("side").notNull(),
  relation: text("relation"),
  email: text("email").notNull(),
  phone: text("phone"),
  diet: text("diet"),
  source: familySourceEnum("source").notNull().default("committee"),
  inviteTokenHash: text("invite_token_hash"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  /** Whether this household's invitation shows the Travel & Stay section.
      null = automatic: shown when they're invited to every event. */
  showTravel: boolean("show_travel"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const guests = pgTable("guests", {
  id: uuid("id").defaultRandom().primaryKey(),
  /** insertion order — lists show guests in the order they were added */
  seq: integer("seq").generatedByDefaultAsIdentity(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  ageGroup: ageGroupEnum("age_group").notNull().default("adult"),
  email: text("email"),
  phone: text("phone"),
  /** The household's primary adult: invites by email or WhatsApp go to them.
      The family's own email/phone columns mirror this guest's. */
  isPrimary: boolean("is_primary").notNull().default(false),
  /** values for the wedding's guestColumns, keyed by column id */
  details: jsonb("details").$type<Record<string, string>>(),
});

export const eventInvites = pgTable("event_invites", {
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.eventId, t.familyId] })]);

export const rsvps = pgTable("rsvps", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  status: rsvpStatusEnum("status").notNull(),
  headcount: integer("headcount").notNull().default(0),
  /** Which of the family's guests are coming. Set whenever the committee or
      couple answers (then headcount = its length). null = the family gave a
      number without names (their own RSVP link), so who exactly is unknown. */
  guestIds: jsonb("guest_ids").$type<string[]>(),
  note: text("note"),
  respondedAt: timestamp("responded_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("rsvp_event_family").on(t.eventId, t.familyId)]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  role: roleEnum("role").notNull(),
  weddingId: uuid("wedding_id").references(() => weddings.id), // null for admin = all weddings
  emailVerified: timestamp("email_verified", { withTimezone: true }), // Auth.js adapter field
});

export const accounts = pgTable("accounts", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
}, (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })]);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable("verification_tokens", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull(),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
}, (t) => [primaryKey({ columns: [t.identifier, t.token] })]);

export const emailLog = pgTable("email_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  type: emailTypeEnum("type").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  status: text("status").notNull(), // "sent" | "failed: <message>"
});

/** Mail that would have been sent, when no SMTP transport is configured. Replaces the
    local outbox file in production, where the filesystem is read-only. */
export const outbox = pgTable("outbox", {
  id: uuid("id").defaultRandom().primaryKey(),
  to: text("to").notNull(),
  subject: text("subject").notNull(),
  kind: text("kind").notNull(), // "signin" | "invite"
  link: text("link"),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
});

/** What a couple can choose to wipe in a reset. Their own login, names, date,
    city and web address always stay. */
export type ResetScope = {
  guests: boolean;      // families, guests, invitations and their replies
  rsvps: boolean;       // every reply, keeping the guest list
  events: boolean;      // celebrations, back to the single wedding day
  photos: boolean;      // gallery photos and their files
  content: boolean;     // story, tagline, parents, travel, hashtag, contact, theme, RSVP settings
  committee: boolean;   // other team members' logins
  /** set: only this family's part (its guests, own events, photos, look, RSVP settings) */
  side?: "bride" | "groom";
};

/** A destructive request waiting for its email confirmation. Only the
    SHA-256 of the emailed token is stored; each one works once, briefly. */
export const accountActions = pgTable("account_actions", {
  id: uuid("id").defaultRandom().primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  kind: text("kind").$type<"delete" | "reset">().notNull(),
  weddingId: uuid("wedding_id").notNull().references(() => weddings.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  scope: jsonb("scope").$type<ResetScope>(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
