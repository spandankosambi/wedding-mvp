<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Where things are, and how we write them

- `README.md`: setup, commands, settings, project structure, conventions, testing and releasing.
- `docs/ARCHITECTURE.md`: how the layers fit, the API (server actions and route handlers), permissions, data, errors, printing.
- Each main folder has a README: `src/app`, `src/lib`, `src/components`.
- Keep to the conventions there:
  - business logic goes in `src/lib/<area>`, never importing `src/app`;
  - server actions end in `Action`;
  - settings are read only via `src/config/env.ts`;
  - screens call the server through `safeCall()`;
  - database changes go in a migration plus `src/db/ensure.ts`;
  - no unused code (`npx tsc --noEmit`, `npx knip`).

# Product principles: follow on every change

Standing rules from the owner (Spandan), 24 November 2026. They apply to every task, big or small. If a request seems to conflict with one, stop and ask.

## A. Security and privacy (highest priority)

1. **Never trust ids sent from the browser.** Every server action and route checks on the server that each household, guest, event or file belongs to the user's wedding. For one-side committee members, it must also be on their side, or be a common item they're allowed to touch. Check this in the database query, not just by hiding things on screen.
2. **Shared and public links never change, reveal or take over an existing household.** This covers the family share link `/w/[slug]?side=…&k=…` and the QR code on cards. Only a household's own private token link may change that household's answers.
3. **Never show one household's details to anyone else.** That means its name, members, contact details, hotel or answers. Only that household and the couple or committee may see them.
4. **Private pages stay hidden and untracked.**
   - Every private page (`/w`, `/rsvp`, `/couple`, `/committee`, `/confirm`, `/admin`) stays "noindex, nofollow".
   - Never add analytics, ad pixels, session recording or third-party scripts to these pages.
   - Tracking may only go on public marketing pages (home, pricing, sign-up), and only with a consent banner.
5. **Every path that sends email is rate-limited** per address, per visitor and per household, and counts against the daily email budget. Sign-in emails always keep a reserved share.
6. **Rate limits use the shared database store** (`src/lib/auth/ratelimit.ts`), never in-memory variables.
7. **No secrets in code or in committed files.** Settings go only in environment variables, read through `src/config/env.ts`.
8. **Uploads:** allow-list the file types (no SVG or HTML), limit the size, and store under random names.
9. **Escape everything users type:** in emails, in HTML, and in CSV/XLSX exports (formula injection).
10. **Stop and ask before any feature that stores highly sensitive data** (for example government IDs). It needs its own security review first.

## B. Design for the real user

11. **Phones first.** Users are Indian wedding families: many aren't tech-savvy, and most use budget phones on patchy mobile data. Design and test every screen at phone width (375px) first.
12. **Every new or changed screen handles all its states:**
    - empty, loading, success and error;
    - form mistakes;
    - slow or no internet;
    - no permission;
    - an expired or broken link;
    - very long names or text.

    Use friendly, specific wording, never raw errors.
13. **Keep guest flows minimal.** The RSVP stays at about one tap per event plus Send. Don't add steps or required fields for guests without asking the owner.
14. **Destructive actions need a clear confirmation or "press and hold".** This covers deleting a household, replacing a link and removing an event. Nothing is ever deleted by one accidental tap.

## C. Look and code quality

15. **Keep One Tap Invites' one consistent look:** the existing colours, fonts, components and spacing. Don't add a new UI or animation library, theme or style without the owner's approval.
16. **No "AI-generic" design.**
    - No filler badges or decorative labels.
    - Show the real product, and write specific headlines.
    - One clear main button per screen.
    - Consistent icons, enough text contrast, sentence case.
17. **Make the smallest change that works.** Reuse existing components and helpers. Don't rewrite working code that wasn't asked for.
18. **Ask before adding anything new.** Before installing any package, plugin, skill or service, tell the owner what it is, what it can access and why, and get a yes.

## D. Testing and release

19. **Every fix or feature gets tests** (Vitest and/or Playwright). Include "should be refused" tests for permissions: another wedding, the other side, view-only access, and a guest token for another household.
20. **Run the full test suite before saying something is done,** and report the result.
21. **Before launch and before big releases:** a security re-check, a leaked-secret scan (gitleaks), and Google Lighthouse on mobile (target 90+ for performance and accessibility).
