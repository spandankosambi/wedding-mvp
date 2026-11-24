# Architecture

How One Tap Invites is put together, for anyone changing it. The README covers
setting up, commands and conventions; this covers how the pieces fit.

## The shape

```
 Browser ──► src/proxy.ts            "signed in?" for staff pages; nothing else
         ──► src/app/**/page.tsx     server components: check access, load data, render
               └─ client components  screens that need the browser (forms, preview)
                    └─ server actions  src/app/**/actions.ts: check access, validate, call lib
         ──► src/app/**/route.ts     the few plain HTTP endpoints (PDF, export, calendar, auth)
                                     │
                                     ▼
                              src/lib/<area>/   business rules and database work (no screens)
                                     │
                                     ▼
                              src/db/           Drizzle schema + client (Neon live, PGlite locally)
```

**Three layers, one direction.** Pages and actions call `src/lib`, and `src/lib` calls
`src/db`. `src/lib` never imports from `src/app`. Shared UI sits in `src/components`;
a page's own pieces sit beside it in an `_folder` (e.g. `src/app/couple/_print/`,
`src/app/couple/site/_sections/`). Next.js ignores underscore folders as web addresses.

**Data is loaded on the server.** Pages are server components that read the database
directly, so the browser holds only what a screen needs while it's being used. That's
why there's no client-side state library:
- **Form state** is React state.
- **Saved data** is the database.
- **After a save**, the page refreshes (`router.refresh()` or a redirect).

## The API

There's no separate API server. Two kinds of server entry point, both in `src/app`:

1. **Server actions** (`"use server"` files, all named `…Action`). Every form and button
   that changes something calls one, grouped by area:

   | File | What it changes |
   |---|---|
   | `couple/site/actions.ts` | the wedding site: details, wording, celebrations, travel, photos, music, design |
   | `couple/actions.ts` | the couple's overview: theme, print settings, card wording |
   | `couple/card-words-actions.ts` | Gujarati/Hindi card wording |
   | `couple/people/actions.ts` | who can sign in and what they may do |
   | `couple/danger/actions.ts` | resetting or deleting a wedding (confirmed by email) |
   | `couple/help-actions.ts`, `feedback-actions.ts` | help and feedback messages |
   | `committee/actions.ts` | households, guests, invites, replies, hotels & rooms |
   | `committee/import/actions.ts`, `committee/sheet-actions.ts` | guest-list import and spreadsheet round trip |
   | `rsvp/actions.ts`, `w/[slug]/rsvp/actions.ts` | a guest's RSVP (private link; open link) |
   | `start/actions.ts` | sign-up |

   **Shape of an action:**
   1. Check who's asking: `requireRole` / `requireAccess` / `guestListScope`.
   2. Validate the input with zod.
   3. Call `src/lib`.
   4. Return `{ ok: true, … }` or `{ ok: false, error }`, or `redirect()`.

2. **Route handlers** (`route.ts`) for things that aren't a form:

   | Endpoint | Method | Returns |
   |---|---|---|
   | `/couple/invitation` | POST | the cards' PDF (body: options, `part` = all / card / envelope) |
   | `/committee/export` | GET | the guest list as a spreadsheet |
   | `/rsvp/[token]/calendar` | GET | a calendar file (.ics) for a guest's celebrations |
   | `/api/auth/[...nextauth]` | GET/POST | sign-in (Auth.js) |

**Adding a feature:**
1. Put the rule and database work in `src/lib/<area>/`.
2. Add an action (or a route handler, if it returns a file).
3. Build the screen in `src/app`.
4. Write a unit test for the rule and a browser test for the flow.

## Who may do what

- **Sign-in:** magic links via Auth.js (`src/auth.ts`). Only addresses already provisioned
  can sign in: couples provision themselves at `/start`, and the couple adds family
  members at `/couple/people`.
- **Roles and areas** (`src/lib/auth/access.ts`):
  - roles are couple, committee and admin;
  - areas are site, guests and print;
  - each area is none, view or full access, on one family's side or both.
- **Checks** run in every page and action (`src/lib/auth/authz.ts`). `proxy.ts` only bounces
  people who aren't signed in.
- **Guests never sign in.** A household's private link carries a token, stored only as a hash.
  A family's shared link carries a short code (`?k=…`, `src/lib/site/share.ts`).
- **A shared link never touches a household already on the list.** Every reply through it becomes
  a new household on the link's side, for that side's events only (`src/lib/guests/open-rsvp.ts`).
  If its phone or email matches a household there, it is flagged "Needs a look" and the couple or
  committee merges it or keeps it separate (`src/lib/guests/possible-match.ts`).
- **Guest-list import keeps to the importer's side** (`src/lib/import/commit.ts`): someone who works
  one family's side is offered that side's events, and rows are matched only against that side's
  households, in preview and commit. Commit re-checks the household's side in the database and never
  updates or merges one from the other side; "update" never moves a household to the other side.
- **Events and sides** (`src/lib/site/editor.ts`): someone who works one family's side may edit,
  publish, delete, move and sort only the common events and that side's own, checked in each query.
  Only the couple (or both-side access) can turn a common event into one family's own.
- **Rate limits** live in the database (`src/lib/auth/ratelimit.ts`), never in memory. The
  visitor's IP comes from Vercel's own `x-vercel-forwarded-for` header, which visitors can't fake.
  Sign-in links: 3 per address per 15 minutes, 10 a day, 10 per visitor per 15 minutes, counted
  for every address (known or not) in Auth.js's `signIn` step, so the page and `/api/auth` both
  obey them (`src/lib/auth/signin-limits.ts`).
- **Email budget** (`src/lib/email/mailer.ts`): every email goes through one `dispatch`, which
  counts the last 24 hours. Past `EMAIL_DAILY_BUDGET − 50`, mail that can wait is queued; sign-in
  links may use the last 50. `/admin` shows the count and sends the queue.

## The data

Postgres via Drizzle (`src/db/schema.ts`). Main tables:

| Table | Holds |
|---|---|
| `weddings` | the couple, date, city, address (`slug`) |
| `wedding_sides` | each family's own settings: look, wording, contacts, stays, gallery, music, print wording |
| `events` | celebrations (common or one family's), with time zone and duration |
| `families`, `guests` | households and the people in them; one primary guest per household |
| `event_invites`, `rsvps` | who's invited to what, and their replies |
| `users`, `accounts`, `sessions`, `verification_tokens` | sign-in (Auth.js) |
| `email_log`, `outbox` | invitations sent per household; every email sent, recorded or queued (counts against the daily budget) |
| `rate_limits` | shared rate-limit counters, so every server sees the same counts |
| `account_actions` | email-confirmed resets and deletions |
| `machine_text` | saved Azure translations, so each line is translated once |

**Changing the database:**
1. Add a migration in `drizzle/`, edited to use `IF NOT EXISTS`.
2. Add the same statement to `src/db/ensure.ts`. That runs at server start (`src/instrumentation.ts`),
   with retries for a slow first connection, and only ever adds.

## When things go wrong

| Where | What happens |
|---|---|
| Expected problems (bad input, not allowed) | returned as `{ ok: false, error }` and shown on the screen |
| A server call fails unexpectedly | `safeCall()` turns it into "Couldn't reach the server…"; the floating Save keeps the changes unsaved |
| A page fails | `src/app/error.tsx` ("Something went wrong", Try again, a code to quote) |
| A wrong address | `src/app/not-found.tsx` |
| The site's frame fails | `src/app/global-error.tsx` |
| A setting is missing | logged at start-up by `envProblems()` in `src/config/env.ts` |
| An optional service fails (translator, AI) | the feature falls back quietly (built-in spelling; name-based matching) |

## Printing

Everything is in `src/lib/invitation/`:

| File | Job |
|---|---|
| `options.ts` | every print choice (zod) and the paper maths: card size, folded sheet, which paper, print instructions |
| `content.ts` | turns the wedding into the card's words, plus download file names |
| `i18n.ts`, `translit.ts`, `machine.ts` | Gujarati and Hindi: our phrases, built-in spelling, Azure for names and free text (saved in `machine_text`) |
| `envelope.ts` | envelope sizes and the cut-and-fold template; a test folds every size and checks the back closes |
| `pdf/` | the drawing: `primitives` (frame, text, ornaments, marks), `front`, `back`, `envelope-pages`, `folded-card`, `index` |

The Print cards screen (`src/app/couple/_print/`) shows a live preview by drawing the
real PDF in the browser (pdf.js). Download fetches the cards and the envelope as
separate files.

## Start-up

`src/instrumentation.ts` runs once per server:
1. Logs missing settings.
2. Applies `src/db/ensure.ts` (database additions).
3. Runs one-off data fixes, for example removing a real phone number from the example wedding.

Each step retries on its own.

## Tests

| Kind | Where | Covers |
|---|---|---|
| Unit | `tests/unit/` | rules, PDFs (rendered and measured), translations (with a fake Azure), the envelope geometry, settings |
| Browser | `tests/e2e/` | real flows against a local server with the seeded demo weddings |

Local browser runs use `playwright.local.config.ts` (not in git) for the Chromium path.

## Working agreements

- Every change: branch → tests → merge to `main` → live.
- Each request has a numbered item on the tracker (a claude.ai artifact) with what
  changed and how to test it.
- The project handbook (`claude/One-Tap-Invites-Handbook.md` in the claude.ai project)
  is refreshed every Sunday.
