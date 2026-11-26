import { pgTable, pgEnum, text, integer, boolean, jsonb, timestamp, uuid, primaryKey, uniqueIndex, index, date } from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export const themeEnum = pgEnum("theme", ["ivory-editorial", "raj-mahal", "gulaab-rococo", "mehfil-noor", "pichwai-bagh", "neel-chhapa"]);
export const sideEnum = pgEnum("side", ["bride", "groom", "both"]);
export const roleEnum = pgEnum("role", ["admin", "couple", "committee"]);
export const rsvpStatusEnum = pgEnum("rsvp_status", ["attending", "declined"]);
export const ageGroupEnum = pgEnum("age_group", ["adult", "child"]);
export const emailTypeEnum = pgEnum("email_type", ["invite", "reminder", "resend"]);
export const familySourceEnum = pgEnum("family_source", ["committee", "import", "guest"]);

/** Travel & stay copy the couple writes in their editor — prose, not relational data. */
/** A family's design touches on its site (see lib/site-decor.ts for the choices). */
export type SiteDecor = {
  /** how much moves: nothing, the gentle default, or everything */
  motion?: "none" | "gentle" | "lively";
  /** an animated backdrop behind the opening */
  scene?: "none" | "night" | "garden" | "palace";
  reveal?: "none" | "envelope" | "doors" | "curtain";
  falling?: "petals" | "marigold" | "sparkles" | "diyas" | "none";
  toran?: boolean;
  corners?: boolean;
  divider?: "theme" | "lotus" | "paisley" | "diamonds";
  icons?: boolean;
};

/** Someone guests can reach about their RSVP. */
export type RsvpPerson = { name: string; phone: string; whatsapp: boolean };

export type TravelInfo = {
  /** `common`: shown by both families (kept in step on both sides) */
  stays: { name: string; note: string; url?: string; common?: boolean }[];
  gettingThere: string;
};

/** The couple's own photos for the Gallery section, stored in Vercel Blob.
    `null` (every wedding before this existed) means: shown, no photos yet. */
export type GalleryPhoto = { url: string; pathname: string; width: number; height: number };
export type GalleryInfo = { enabled: boolean; photos: GalleryPhoto[] };
/** "Things to know": short notes for guests (parking, weather, hashtag…). */
export type KnowItem = { title: string; text: string };
/** Background music for a family's site: one MP3 in Vercel Blob. */
export type SiteMusic = { url: string; pathname: string; name: string };
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
  /** replies from people who are not on the guest list (the shared link); off unless the family turns it on */
  rsvpOpen: boolean("rsvp_open").notNull().default(false),
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
  /** replies from people who are not on the guest list (the shared link); off unless the family turns it on */
  rsvpOpen: boolean("rsvp_open").notNull().default(false),
  rsvpDeadline: timestamp("rsvp_deadline", { withTimezone: true }),
  /* the invitation's wording, on the site and the printed cards */
  invocation: text("invocation"),
  /** a blessing or shloka, line by line (Devanagari works) */
  shloka: text("shloka"),
  /** RSVP contacts (up to two): replaces rsvpContacts and contactPhone, which are read only if this is unset */
  rsvpPeople: jsonb("rsvp_people").$type<RsvpPerson[]>(),
  /** older: RSVP contacts, one per line */
  rsvpContacts: text("rsvp_contacts"),
  /** "with best compliments from", line by line */
  compliments: text("compliments"),
  closingLine: text("closing_line"),
  /** design touches on the site: opening reveal, falling effect, decorations, icons */
  decor: jsonb("decor").$type<SiteDecor>(),
  /** "Things to know" notes for guests */
  know: jsonb("know").$type<KnowItem[]>(),
  /** background music */
  music: jsonb("music").$type<SiteMusic>(),
  /** the code in this family's shared link; without it the site shows only names and date */
  shareKey: text("share_key"),
  /** the print page's saved choices (size, design…), without the photo */
  printConfig: jsonb("print_config").$type<Record<string, unknown>>(),
  /** the printed cards' words in Gujarati / Hindi, as the family edited them: lang → key → text (print only) */
  printText: jsonb("print_text").$type<Record<string, Record<string, string>>>(),
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
  /** the celebration's icon (lib/invitation/decor ICONS); unset = picked from its name */
  icon: text("icon"),
  /** an uploaded icon ("custom"): a 96×96 alpha mask, base64 — drawn in the theme's colour */
  iconImage: text("icon_image"),
  /** how long the celebration runs, for guests' calendar entries */
  durationMinutes: integer("duration_minutes").notNull().default(180),
  /** where the celebration happens, so its time means local time there */
  timeZone: text("time_zone").notNull().default("Asia/Kolkata"),
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
  /** when this household was last sent its stay details, and how */
  staySent: jsonb("stay_sent").$type<StaySent>(),
  /** A reply from a family's shared link whose phone or email matched this
      existing household. The reply is kept apart until the couple or
      committee merges it ("Yes, that's them") or keeps it separate. */
  possibleMatchFamilyId: uuid("possible_match_family_id").references((): AnyPgColumn => families.id, { onDelete: "set null" }),
  possibleMatchBy: text("possible_match_by").$type<"phone" | "email">(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type StaySent = {
  /** WhatsApp: when the message was opened, ready to send (we can't see it go) */
  whatsappAt?: string;
  whatsappTo?: string | null;
  emailAt?: string;
  emailTo?: string;
};

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
  /** Whoever signed the wedding up: the only one who can remove the other partner or delete the wedding. */
  isOwner: boolean("is_owner").notNull().default(false),
  /** Which family's section a committee member works in. The couple always has both. */
  side: text("side").$type<"bride" | "groom" | "both">().notNull().default("both"),
  /** What a committee member may do on each page; null = the old default (guest list only). */
  access: jsonb("access").$type<{ site: "none" | "view" | "full"; guests: "none" | "view" | "full"; print: "none" | "full" }>(),
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
  kind: text("kind").notNull(), // "signin" | "invite" | "calendar" | "stay" | …
  link: text("link"),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  /** "recorded": outbox mode, nothing sent · "sent": went out by SMTP ·
      "queued": waiting for the daily email allowance to free up */
  status: text("status").notNull().default("recorded"),
  /** when it went out (or was recorded); counts against the daily email budget */
  sentAt: timestamp("sent_at", { withTimezone: true }),
  /** what a queued email needs to be sent later; cleared once it's sent */
  payload: jsonb("payload").$type<QueuedMail>(),
}, (t) => [index("outbox_sent_at").on(t.sentAt)]);

export type QueuedMail = {
  from?: string; html: string; replyTo?: string;
  icalEvent?: { method: string; filename: string; content: string };
  /** an invitation: log it against the household once it goes out */
  log?: { familyId: string; type: "invite" | "reminder" | "resend" };
};

/** Shared rate-limit counters: one row per key, counted within a window.
    In the database so every server sees the same counts. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
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

/* Lines machine-translated for the printed cards (Azure Translator), kept so
   each is fetched once: kind "name" is spelled out (transliterated), "text" translated. */
export const machineText = pgTable("machine_text", {
  lang: text("lang").notNull(),
  kind: text("kind").notNull(),
  src: text("src").notNull(),
  out: text("out").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.lang, t.kind, t.src] })]);

/* ── Plan: the couple's and committees' to-dos and meeting notes ──────────
   Three spaces per wedding: "Both families" (side null) and one private
   space for each family ("bride" / "groom", shown by the child's first name). */

export type PlanSide = "bride" | "groom";
export type MeetingType = "family" | "vendor" | "other_family";

export const planMeetings = pgTable("plan_meetings", {
  id: uuid("id").defaultRandom().primaryKey(),
  weddingId: uuid("wedding_id").notNull().references(() => weddings.id, { onDelete: "cascade" }),
  /** null = Both families */
  side: text("side").$type<PlanSide>(),
  meetingDate: date("meeting_date", { mode: "string" }).notNull(),
  title: text("title").notNull(),
  type: text("type").$type<MeetingType>().notNull().default("family"),
  attendees: text("attendees"),
  notes: text("notes"),
  decisions: text("decisions"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("plan_meetings_wedding").on(t.weddingId)]);

export const planTasks = pgTable("plan_tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  weddingId: uuid("wedding_id").notNull().references(() => weddings.id, { onDelete: "cascade" }),
  /** null = Both families */
  side: text("side").$type<PlanSide>(),
  title: text("title").notNull(),
  ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  /** for someone without a login */
  ownerName: text("owner_name"),
  dueDate: date("due_date", { mode: "string" }),
  done: boolean("done").notNull().default(false),
  doneAt: timestamp("done_at", { withTimezone: true }),
  /** deleting the meeting keeps the task, just unlinked */
  meetingId: uuid("meeting_id").references(() => planMeetings.id, { onDelete: "set null" }),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("plan_tasks_wedding").on(t.weddingId)]);

/** Page tours: which tours each person has finished or skipped, so they're
    shown once, on any device. */
export const tourProgress = pgTable("tour_progress", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tour: text("tour").notNull(),
  /** "finished" or "skipped" */
  how: text("how").notNull(),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.tour] })]);

/* ── Rishta Corner: host-vouched introductions between singles at one
   wedding. Everything about a profile is deleted when the wedding's window
   closes; only consent records and reports are kept (180 days). ───────── */

export type RishtaGender = "woman" | "man";
export type RishtaStatus = "draft" | "pending" | "live" | "removed";
export type RishtaPhoto = { pathname: string; url: string; width: number; height: number };
export type RishtaConsent = { notice: string; lang: string; at: string; declarations: string[] };

/** Per wedding: switched on by admin during the pilot; the couple sets the window. */
export const rishtaSettings = pgTable("rishta_settings", {
  weddingId: uuid("wedding_id").primaryKey().references(() => weddings.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  opensOn: date("opens_on", { mode: "string" }).notNull(),
  closesOn: date("closes_on", { mode: "string" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const rishtaProfiles = pgTable("rishta_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  weddingId: uuid("wedding_id").notNull().references(() => weddings.id, { onDelete: "cascade" }),
  /** the invited household that started it (from its own private RSVP link) */
  familyId: uuid("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  status: text("status").$type<RishtaStatus>().notNull().default("draft"),
  firstName: text("first_name").notNull(),
  gender: text("gender").$type<RishtaGender>().notNull(),
  lookingFor: text("looking_for").$type<RishtaGender>().notNull(),
  birthYear: integer("birth_year").notNull(),
  city: text("city").notNull().default(""),
  education: text("education").notNull().default(""),
  profession: text("profession").notNull().default(""),
  bio: text("bio").notNull().default(""),
  /** e.g. "Ananya's cousin": shown only if the single agrees and the host approves the wording */
  relation: text("relation"),
  relationShown: boolean("relation_shown").notNull().default(false),
  relationApproved: boolean("relation_approved").notNull().default(false),
  /** Jeevansathi / Shaadi.com profile; shown only after a mutual match */
  externalUrl: text("external_url"),
  familyContactName: text("family_contact_name"),
  familyContactPhone: text("family_contact_phone"),
  photos: jsonb("photos").$type<RishtaPhoto[]>().notNull().default([]),
  /** the single's own email; their private link and passcodes go here */
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull(),
  otpHash: text("otp_hash"),
  otpExpiresAt: timestamp("otp_expires_at", { withTimezone: true }),
  otpTries: integer("otp_tries").notNull().default(0),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  consent: jsonb("consent").$type<RishtaConsent>(),
  marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("rishta_profiles_wedding").on(t.weddingId), uniqueIndex("rishta_profiles_token").on(t.tokenHash)]);

/** A private "Interested". Two of them, each way, are a match. */
export const rishtaInterests = pgTable("rishta_interests", {
  fromId: uuid("from_id").notNull().references(() => rishtaProfiles.id, { onDelete: "cascade" }),
  toId: uuid("to_id").notNull().references(() => rishtaProfiles.id, { onDelete: "cascade" }),
  /** this side agreed to "Introduce our families" */
  introduce: boolean("introduce").notNull().default(false),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.fromId, t.toId] })]);

export const rishtaBlocks = pgTable("rishta_blocks", {
  fromId: uuid("from_id").notNull().references(() => rishtaProfiles.id, { onDelete: "cascade" }),
  toId: uuid("to_id").notNull().references(() => rishtaProfiles.id, { onDelete: "cascade" }),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.fromId, t.toId] })]);

/** Kept 180 days after the window closes, for the grievance officer. */
export const rishtaReports = pgTable("rishta_reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  weddingId: uuid("wedding_id").notNull().references(() => weddings.id, { onDelete: "cascade" }),
  profileId: uuid("profile_id").references(() => rishtaProfiles.id, { onDelete: "set null" }),
  reporterId: uuid("reporter_id").references(() => rishtaProfiles.id, { onDelete: "set null" }),
  /** a first name only, so the report still makes sense once the profile is gone */
  aboutName: text("about_name").notNull(),
  reason: text("reason").notNull(),
  note: text("note"),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

/** Proof of each publish: kept 180 days after close; the email is stored scrambled. */
export const rishtaConsents = pgTable("rishta_consents", {
  id: uuid("id").defaultRandom().primaryKey(),
  weddingId: uuid("wedding_id").notNull().references(() => weddings.id, { onDelete: "cascade" }),
  emailHash: text("email_hash").notNull(),
  consent: jsonb("consent").$type<RishtaConsent>().notNull(),
  closesOn: date("closes_on", { mode: "string" }).notNull(),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
});
