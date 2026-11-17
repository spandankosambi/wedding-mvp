import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";

/* Uses the second demo wedding (Karishma & Gaurav); its couple login set it up. */

function latestSignInUrl(email: string): string {
  const lines = fs.readFileSync("var/outbox/mail.jsonl", "utf8").trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = JSON.parse(lines[i]);
    if (m.to === email && m.signInUrl) return m.signInUrl;
  }
  throw new Error(`no sign-in link for ${email}`);
}
async function signIn(page: Page, email: string) {
  await page.goto("/signin");
  await page.fill("input[name=email]", email);
  await page.click("button[type=submit]");
  await expect(page.getByText(/on its way/i)).toBeVisible();
  await page.goto(latestSignInUrl(email));
}
const shots = process.env.SHOTS_DIR;

test("the couple give a friend view-only access to one side, widen it, then remove them", async ({ page, browser }) => {
  test.setTimeout(120_000); // two people, many pages: slow on a cold dev server
  const friend = `friend-${Date.now()}@example.com`;
  await signIn(page, "couple2@example.com");
  await page.getByRole("link", { name: "People", exact: true }).click();
  await expect(page.getByRole("heading", { name: "People & access" })).toBeVisible();
  // the couple themselves: listed, and not editable by themselves
  const me = page.getByTestId("person").filter({ hasText: "couple2@example.com" });
  await expect(me).toContainText("You");
  await expect(me.getByRole("button", { name: /Remove/ })).toHaveCount(0);

  // add a friend of the bride: site view only, nothing else
  const add = page.locator("#add");
  await add.getByLabel("Name").fill("Friend of the bride");
  await add.getByLabel("Email").fill(friend);
  await add.getByLabel("Side for the new person").selectOption("bride");
  await add.getByLabel("Edit your site for the new person").selectOption("view");
  await add.getByLabel("Guest list for the new person").selectOption("none");
  await add.getByRole("button", { name: "Add" }).click();
  await expect(page.locator("p[role=status]")).toContainText(`We emailed ${friend}`);
  const row = page.getByTestId("person").filter({ hasText: friend });
  await expect(row).toContainText("Hasn't signed in yet");
  if (shots) await page.screenshot({ path: `${shots}/people.png`, fullPage: true });
  // the same email can't be added twice
  await add.getByLabel("Email").fill(friend);
  await add.getByRole("button", { name: "Add" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("already has access");

  // ── the friend signs in: the bride's side only, site view only ──
  const ctx = await browser.newContext();
  const theirs = await ctx.newPage();
  await signIn(theirs, friend);
  await expect(theirs).toHaveURL(/\/couple$/);
  const sections = theirs.getByRole("navigation", { name: "Sections" });
  await expect(sections.getByRole("link", { name: "Bride's side" })).toBeVisible();
  await expect(sections.getByRole("link", { name: "Groom's side" })).toHaveCount(0);
  await expect(theirs.getByRole("link", { name: "People", exact: true })).toHaveCount(0);
  await expect(theirs.getByRole("region", { name: "Groom's family" })).toHaveCount(0);
  await expect(theirs.getByRole("heading", { name: "Names, date, city, parents" })).toHaveCount(0);
  await sections.getByRole("link", { name: "Bride's side" }).click();
  const pages = theirs.getByRole("navigation", { name: "Bride's side pages" });
  await expect(pages.getByRole("link")).toHaveText(["Overview", "Edit your site"]);
  await pages.getByRole("link", { name: "Edit your site" }).click();
  await expect(theirs.getByTestId("view-only")).toBeVisible();
  await expect(theirs.locator("#words textarea[name=story]")).toBeDisabled();
  await expect(theirs.getByTestId("floating-save")).toHaveCount(0);
  if (shots) await theirs.screenshot({ path: `${shots}/view-only.png` });
  // doors that aren't theirs lead back to the dashboard
  for (const url of ["/couple/site?family=groom", "/couple/groom", "/committee?family=bride", "/committee/import?family=bride", "/couple/bride/print", "/couple/people"]) {
    // the local dev server sometimes reports the redirect as an aborted load;
    // where the page ends up is what matters
    await theirs.goto(url).catch((e: Error) => { if (!/ERR_ABORTED/.test(e.message)) throw e; });
    await expect(theirs, url).toHaveURL(/\/couple$/);
  }
  // …and the card download refuses them
  const pdf = await theirs.request.post("/couple/invitation", { data: { options: { version: "bride" } } });
  expect(pdf.status()).toBe(403);

  // ── the couple widen it: full guest list on both sides ──
  await row.getByLabel("Side for Friend of the bride").selectOption("both");
  await row.getByLabel("Guest list for Friend of the bride").selectOption("full");
  await page.getByTestId("floating-save").click();
  await expect(page.locator("p[role=status]")).toContainText("Saved.");
  await theirs.goto("/committee?family=groom");
  await expect(theirs.getByRole("heading", { name: /Groom's family's guest list/ })).toBeVisible();
  await expect(theirs.getByRole("button", { name: "Add family" })).toBeEnabled();

  // ── view-only guest list: look, search, but change nothing ──
  await row.getByLabel("Guest list for Friend of the bride").selectOption("view");
  await page.getByTestId("floating-save").click();
  await expect(page.locator("p[role=status]")).toContainText("Saved.");
  await theirs.reload();
  await expect(theirs.getByRole("button", { name: "Add family" })).toHaveCount(0);
  await expect(theirs.getByRole("searchbox", { name: "Find a family" })).toBeEnabled();
  await expect(theirs.getByRole("checkbox", { name: "Select all families" })).toBeDisabled();

  // ── removed: signed out at once ──
  await row.getByRole("button", { name: "Remove Friend of the bride" }).click();
  await row.getByRole("button", { name: "Yes, remove" }).click();
  await expect(page.getByTestId("person").filter({ hasText: friend })).toHaveCount(0);
  await theirs.goto("/couple");
  await expect(theirs).toHaveURL(/\/signin/);
  await ctx.close();
});

test("every page shares one layout: On this page and About us on the left, what's done on the right", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "couple2@example.com");
  for (const url of ["/couple", "/couple/groom", "/couple/site?family=groom", "/couple/groom/print"]) {
    await page.goto(url);
    await expect(page.getByRole("navigation", { name: "Jump to" }), url).toBeVisible();
    await expect(page.getByRole("region", { name: "About us" }), url).toBeVisible();
    await expect(page.getByRole("region", { name: /what's done/ }).first(), url).toBeVisible();
  }
  // the guest list keeps the left column but gives the table the rest
  await page.goto("/committee?family=groom");
  await expect(page.getByRole("region", { name: "About us" })).toBeVisible();
  await expect(page.getByRole("region", { name: /what's done/ })).toHaveCount(0);
  // the dashboard: both families in one table, a step per row and a column each
  await page.goto("/couple");
  const both = page.getByRole("region", { name: "Both sides: what's done" });
  await expect(both.getByRole("columnheader", { name: /Bride/ })).toBeVisible();
  await expect(both.getByRole("columnheader", { name: /Groom/ })).toBeVisible();
  await expect(both.locator("tbody tr")).toHaveCount(10);
  await expect(page.getByRole("region", { name: /^(Bride|Groom)'s side: what's done$/ })).toHaveCount(0);
  // our logo leads every signed-in page's top bar, ahead of the couple's names
  for (const url of ["/couple", "/couple/groom", "/committee?family=groom", "/couple/people"]) {
    await page.goto(url);
    const nav = page.locator(".portal-nav-inner");
    await expect(nav.getByRole("link", { name: "One Tap Invites home" }), url).toBeVisible();
    await expect(nav.getByRole("link", { name: "Go to the dashboard" }).or(nav.locator(".portal-nav-brand")).first(), url).toBeVisible();
  }
  // the checklist's open steps link to where they are done
  await page.goto("/couple/groom");
  const list = page.getByRole("region", { name: "Groom's side: what's done" });
  await expect(list).toContainText(/\d+ of 10 done/);
  if (shots) await page.screenshot({ path: `${shots}/layout-overview.png` });
});
