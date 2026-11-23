# src/app — pages, actions and endpoints

Next.js App Router: each folder is a web address, except `_folders` (a page's own
pieces) and `(groups)`. Pages load their data on the server and check access
themselves; forms call server actions (`actions.ts`, every function named `…Action`).
Business rules live in `src/lib`, not here.

| Address | Folder | For |
|---|---|---|
| `/` | `page.tsx`, `home/` | the landing page |
| `/start`, `/signin`, `/go` | `start/`, `signin/`, `go/` | sign-up, sign-in, and sending each role to its home |
| `/couple` | `couple/page.tsx` | both families at a glance |
| `/couple/[family]` | `couple/[family]/` | one family's section; `print/` (Print cards) and `print/words/` (Gujarati/Hindi wording) |
| `/couple/site` | `couple/site/` | Edit your site; `_sections/` holds its larger sections |
| `/couple/people` | `couple/people/` | People & access |
| — | `couple/_print/` | the Print cards screen's pieces (form, controls, preview, printing press) |
| — | `couple/PortalFrame`, `PortalNav`, `JumpNav` | the frame, top bar and section menu every couple page shares |
| `/committee` | `committee/` | the guest list (Families, Guests, Hotels & rooms); `import/`, `export/` |
| `/w/[slug]` | `w/[slug]/` | the wedding website and its `sections/`; `rsvp/` for the shared-link RSVP |
| `/rsvp/[token]` | `rsvp/[token]/` | a household's private RSVP; `calendar/` returns an .ics file |
| `/confirm/…` | `confirm/` | email-confirmed reset or delete |
| `/admin` | `admin/` | all weddings, and `mailroom/` |

Special files: `error.tsx` (a page failed), `not-found.tsx`, `global-error.tsx`,
`loading.tsx` (per section), `layout.tsx`, `globals.css`.

Endpoints (`route.ts`): `couple/invitation` (POST → PDF), `committee/export` (GET →
spreadsheet), `rsvp/[token]/calendar` (GET → .ics), `api/auth/[...nextauth]`.
