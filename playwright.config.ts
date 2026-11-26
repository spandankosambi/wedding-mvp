import { defineConfig } from "@playwright/test";

// PORT=3001 npm run e2e — when something else already owns :3000.
const port = process.env.PORT ?? "3000";

// The seed runs INSIDE the web-server command, before `next dev` starts: on-disk
// PGlite is single-process, and Playwright launches the web server before
// globalSetup, so seeding there raced the dev server opening the data dir.
// An unclean shutdown can leave the dir unrecoverable, hence the rm -rf first.
const seed = `rm -rf var/pglite && APP_URL=http://localhost:${port} npx tsx --env-file=.env scripts/seed.ts > var/e2e-seed.txt`;

export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    command: `${seed} && npm run dev -- -p ${port}`,
    // Readiness must NOT touch the database: / redirects into /w/[slug],
    // and hammering a PGlite-backed route during first compile aborts the
    // instance. A static asset only answers once the server is truly up.
    url: `http://localhost:${port}/favicon.ico`,
    // Never reuse a dev server that already holds the data dir.
    reuseExistingServer: false,
    // test accounts may sign in as often as the tests need; plenty of sites per hour
    env: { EMAIL_MODE: "file", RELAXED_TEST_LIMITS: "1", NEW_SITES_PER_HOUR: "1000", TOURS_AUTOSTART: "0" },
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
