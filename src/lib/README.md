# src/lib — business logic

Rules and database work, with no screens. Pages and server actions in `src/app`
call these; nothing here imports from `src/app`. (`invitation/pdf/` uses React only
to draw PDFs.) Grouped by area:

| Folder | What's in it |
|---|---|
| `auth/` | Who may do what. `access` (roles, areas, levels), `authz` (`requireRole`, `requireAccess`, `guestListScope`, where each role lands), `people` (who can sign in to a wedding), `signup`, `account` (email-confirmed reset/delete), `tokens` (private-link tokens, stored hashed), `ratelimit` (shared counters, visitor IP), `signin-limits` |
| `guests/` | The guest list. `household` (households and guests), `primary` (one primary guest per household), `invites` (where an invitation points), `rsvp` and `open-rsvp` (replies by private link or shared link), `possible-match` (merging a shared-link reply into a household it matched), `attendance`, `contacts` (RSVP contacts), `guest-sheet` (spreadsheet round trip), `stay`, `stay-groups`, `travel` (hotels, rooms, Travel & Stay) |
| `site/` | The wedding site and each family's settings. `looks` (a family's look and wording over the shared details), `editor` (saving what the couple edits), `presets` (ceremonies to add in one tap), `gallery`, `site-decor`, `share` (the family's shared link), `sides`, `side-names`, `slug`, `maplinks`, `checklist`, `sample` (the example wedding) |
| `email/` | `mailer` (every email we send) and `calendar` (.ics files and meeting requests) |
| `core/` | Shared helpers. `format` and `timezones` (dates), `brand`, `origin` (this request's address), `retry`, `safe-call` (screens calling the server), `ai` (any OpenAI-compatible service), `help`, `justify` (photo rows), `icon-mask`, `icon-png` |
| `plan/` | Plan: `spaces` (who reaches Both families and each family's space; who may delete), `tasks`, `meetings`, `starter` (the suggested first list). Every query pinned to the wedding and the person's spaces |
| `import/` | Bringing in a guest list: `spreadsheet` → `profile` → `heuristic`/`ai` mapping → `normalize` → `match` → `commit`; `scan` reads photos, Word, PDF and text |
| `invitation/` | Printed cards and envelopes: `options` (choices and paper maths), `content` (the card's words), `i18n`/`langs`/`translit`/`machine` (Gujarati and Hindi), `words` (the wording page), `envelope`, `motifs`/`decor`/`shapes` (ornaments), `pdf/` (the drawing), `fonts/` |

Settings come from `src/config/env.ts`; the database from `src/db/client.ts`.
