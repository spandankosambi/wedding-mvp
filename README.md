# One Tap Invites

A wedding invitation platform. A couple signs up, gets a wedding website, and invites
their families to run the guest list. Each invited household gets a private link to
the site and to RSVP. The couple can print invitation cards and envelopes in English,
Gujarati or Hindi.

Live at **https://onetapinvites.com** (Vercel + Neon Postgres). Pushing to `main`
deploys.

- **New here?** Read this file, then [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
- **Looking for a folder's contents?** Each main folder has its own README:
  [`src/app`](src/app/README.md), [`src/lib`](src/lib/README.md),
  [`src/components`](src/components/README.md).
- **Framework note:** this is Next.js 16. APIs differ from older versions; read
  `node_modules/next/dist/docs/` before changing anything framework-level (see `AGENTS.md`).

## What it does

| Who | Where | What |
|---|---|---|
| Couple | `/start` | Sign up from just the names, date and city |
| Couple | `/couple`, `/couple/[family]` | Both families' overview, each family's own section |
| Couple | `/couple/site` | Edit the wedding site: wording, celebrations, travel & stay, photos, music, design touches |
| Couple | `/couple/people` | Invite family members and choose what each may see or change |
| Couple | `/couple/[family]/print` | Print cards: flat, with event cards, or folded; an envelope; English, Gujarati or Hindi |
| Committee | `/committee` | The guest list: households, guests, invites (email, WhatsApp), replies, hotels & rooms |
| Committee | `/committee/import` | Bring in a guest list from a spreadsheet, a photo or pasted text |
| Guests | `/w/[slug]` | The wedding website (private link per household, or the family's shared link) |
| Guests | `/rsvp/[token]` | A household's RSVP, with calendar invites afterwards |
| Admin | `/admin` | All weddings, and the mailroom (what was emailed) |

The example wedding on the landing page is **Ananya & Arjun** (`/w/ananya-weds-arjun?k=sample`).
Its dates always sit 60 days ahead and its phone numbers are placeholders (`src/lib/site/sample.ts`).

## Stack

Next.js 16 (App Router, Server Components, Server Actions) · React 19 · TypeScript (strict) ·
Tailwind CSS v4 · Drizzle ORM · Postgres (PGlite locally, Neon live) · Auth.js v5 magic links ·
zod · nodemailer · @react-pdf/renderer · Vercel Blob · Azure Translator (optional) ·
Vitest + Playwright.

## Running it locally

Requires Node 20+. No Docker and no database server: locally the app uses
[PGlite](https://pglite.dev), an embedded Postgres stored in `var/pglite`.

```bash
npm install
cp .env.example .env          # set AUTH_SECRET: openssl rand -base64 33
npm run seed                  # creates the tables and the demo weddings
npm run dev                   # http://localhost:3000
```

With `EMAIL_MODE=file` (the default locally), every email, sign-in links included, is
recorded instead of sent: read it at `/admin/mailroom` or in `var/outbox/mail.jsonl`.

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run seed` | Create tables and reseed the demo weddings |
| `npm run db:reset` | Delete the local database and reseed |
| `npm run set-theme <theme>` | Change the demo wedding's look |
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | Browser tests (Playwright; starts its own server and wipes the local database) |
| `npx tsc --noEmit` | Type check (also rejects unused code) |
| `npx knip` | Unused files, exports and packages (should report nothing) |

### Settings

Every setting is read through **`src/config/env.ts`**, never `process.env` directly, and
listed with comments in **`.env.example`**. Live values live in Vercel (Project →
Settings → Environment Variables). At start-up the live server logs any required
setting that's missing.

| Setting | Needed for |
|---|---|
| `DATABASE_URL` | The live database (unset locally: PGlite) |
| `AUTH_SECRET` | Sign-in sessions |
| `APP_URL` | Links built outside a request (seed, tests) |
| `EMAIL_MODE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Sending email (Gmail SMTP) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_SERVICE` | The mail server (unset host: Gmail). Another provider is just these settings |
| `EMAIL_DAILY_BUDGET` | Most emails in any 24 hours (default 400). The last 50 are kept for sign-in links; other mail queues (see `/admin`) |
| `NEW_SITES_PER_HOUR` | Most new wedding sites from `/start` in any hour (default 20) |
| `CONTACT_EMAIL` | Shown on the Rishta Corner grievance page (else the address in `EMAIL_FROM`) |
| `CRON_SECRET` | Lets Vercel Cron run the daily Rishta Corner clean-up (`/api/cron/rishta`); unset, the route refuses and pages still clean up hourly as they're visited |
| `TOURS_AUTOSTART` | Page tours start by themselves the first time (default on; browser tests set `0`) |
| `RELAXED_TEST_LIMITS` | Browser tests only: seeded `@example.com` accounts skip sign-in limits. Ignored in production |
| `BLOB_READ_WRITE_TOKEN` | Photo and music uploads |
| `AZURE_TRANSLATOR_KEY`, `AZURE_TRANSLATOR_REGION` | Optional: better Gujarati/Hindi on printed cards |
| `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `AI_VISION_MODEL` | Optional: AI help in the guest-list import |
| `SEED_STAFF_EMAILS`, `SEED_ON_BUILD` | Seeding only |

## Project structure

```
src/
  app/            pages, layouts, server actions and route handlers (see src/app/README.md)
    _print/       …a page's own pieces live in "_" folders beside it (not web addresses)
  components/     shared UI: error screen, floating Save, form field, icons, keyboard…
  lib/            business logic, no screens, grouped by area (see src/lib/README.md)
    auth/ guests/ site/ email/ core/ import/ invitation/
  config/         settings (env.ts)
  db/             schema, client (Neon/PGlite), start-up changes (ensure.ts)
  themes/         the site looks: catalog, colour tokens, ornaments
  emails/         the invite email template
  auth.ts         Auth.js set-up
  proxy.ts        coarse "signed in?" gate (real checks run in each page and action)
  instrumentation.ts  start-up: settings check, database changes (with retries)
drizzle/          SQL migrations
tests/unit/       Vitest
tests/e2e/        Playwright
scripts/          seed, set-theme
docs/             ARCHITECTURE.md (current); docs/archive/ (older notes, kept for history)
```

## Conventions

- **Files:** a component per file in `PascalCase.tsx`. Other modules are `kebab-case.ts`.
  Server actions live in `actions.ts`, or `<topic>-actions.ts` when a folder has several.
- **Names:** every server action ends in `Action` (`saveEventAction`). Business logic
  functions are plain verbs (`sendInvites`, `getLooks`).
- **Where code goes:** screens and form handling in `src/app`. Anything that touches the
  database or decides a rule goes in `src/lib`, with no React in it except the PDF drawing.
  UI used in more than one place goes in `src/components`.
- **Errors:**
  - Problems you expect (bad input, not allowed) come back as `{ ok: false, error }`, and
    the screen shows them.
  - Unexpected ones (network, server) are caught on screen by `safeCall()` (`src/lib/core/safe-call.ts`).
  - Pages that fail show `src/app/error.tsx`.
  - Never catch Next's own redirect or not-found signals: use `unstable_rethrow`.
- **Permissions:**
  - Every page and action checks for itself (`requireRole`, `requireAccess`, `guestListScope` in `src/lib/auth/authz.ts`).
  - `proxy.ts` only bounces visitors who aren't signed in.
- **Database changes:** add a Drizzle migration (with `IF NOT EXISTS`), and mirror it in
  `src/db/ensure.ts`, which applies it to the live database at start-up.
- **Unused code:** the type checker rejects it (`noUnusedLocals`), and `npx knip` should
  report nothing.

## Testing and releasing

1. Work on a `wip/…` branch.
2. Check everything: `npx tsc --noEmit`, `npm test`, and the relevant `tests/e2e` files.
   - The local test database can crash during long browser runs. When a test fails within
     about a second right after an `Aborted()` message, rerun that file on its own.
3. Merge into `main` (`--ff-only`) and push. Vercel builds and deploys in about 3–4 minutes.
   A failed build never replaces the live site.
4. Note the change on the tracker (see `docs/ARCHITECTURE.md` → Working agreements).

Known: `tests/unit/import/spreadsheet.test.ts` has one long-standing failing test.
