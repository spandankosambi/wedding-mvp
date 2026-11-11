import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";

/* Uses the second demo wedding (Karishma & Gaurav) so the first stays as the
   other specs expect it. */

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

test("an event can be one family's own; each family's section, list and site follow", async ({ page }) => {
  await signIn(page, "couple2@example.com");

  // ── in the bride's section, the couple makes the Mehendi the bride's own ──
  await page.goto("/couple/site?family=bride");
  const mehendi = page.locator("details", { has: page.getByText("Mehendi", { exact: true }) }).first();
  await mehendi.locator("summary").click();
  const common = mehendi.getByLabel("Mehendi is common for both families");
  await expect(common).toBeChecked();
  await common.uncheck();
  await expect(mehendi.getByText("Only the bride's family's event")).toBeVisible();
  if (shots) await mehendi.screenshot({ path: `${shots}/event-side.png` });
  await mehendi.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved. Your site is up to date.")).toBeVisible();
  await expect(mehendi.locator("summary").getByText("This family only")).toBeVisible();

  // the groom's section no longer has it
  await page.goto("/couple/site?family=groom");
  await expect(page.getByRole("heading", { name: /edit the groom's family's site/i })).toBeVisible();
  await expect(page.locator("details", { has: page.getByText("Mehendi", { exact: true }) })).toHaveCount(0);

  // ── each family's guest list follows ─────────────────────────
  await page.goto("/committee?family=groom");
  // the groom's parents were invited to everything; the bride's Mehendi isn't theirs any more
  const saxena = page.getByRole("row", { name: /Saxena Family/ });
  await expect(saxena.getByText(/Sangeet/)).toBeVisible();
  await expect(saxena.getByText(/Mehendi/)).toHaveCount(0);
  await expect(page.getByRole("row", { name: /Malhotra Family/ })).toHaveCount(0); // the bride's

  await page.goto("/committee?family=bride");
  await expect(page.getByRole("row", { name: /Malhotra Family/ }).getByText(/Mehendi · Bride/)).toBeVisible();
  // a new family joins this list, offered common events and the bride's own
  await page.getByRole("button", { name: "Add family" }).click();
  const dialog = page.getByRole("dialog");
  const side = dialog.getByRole("combobox", { name: "Side" });
  await expect(side).toHaveValue("bride");
  await expect(side.locator("option")).toHaveText(["Bride's family", "Groom's family"]); // no "both"
  await dialog.getByRole("button", { name: "Mehendi · Bride" }).click();
  await expect(dialog.getByRole("button", { name: "Mehendi · Bride" })).toHaveAttribute("aria-pressed", "true");
  if (shots) await page.screenshot({ path: `${shots}/family-side-events.png` });
  // moving it to the groom's family drops the bride's own event
  await side.selectOption("groom");
  await expect(dialog.getByRole("button", { name: /Mehendi/ })).toHaveCount(0);

  // ── guests: each family's site shows its own events ──────────
  await page.goto("/w/gaurav-weds-karishma?side=bride");
  await expect(page.getByRole("heading", { name: "Mehendi", level: 3 })).toBeVisible();
  await page.goto("/w/gaurav-weds-karishma?side=groom");
  await expect(page.getByRole("heading", { name: "Mehendi", level: 3 })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Sangeet", level: 3 })).toBeVisible();
});

test("hotels can be common or one family's own, and you can add as many as needed", async ({ page }) => {
  await signIn(page, "couple2@example.com");
  await page.goto("/couple/site?family=bride");
  const travel = page.locator("#travel");
  const stays = travel.getByTestId("stay");
  const before = await stays.count();

  // + adds a hotel, common for both families unless unticked
  await travel.getByRole("button", { name: "+ Add another hotel" }).click();
  await stays.last().getByLabel("Hotel", { exact: false }).first().fill("Shared Haveli");
  await expect(stays.last().getByLabel("Shared Haveli is common for both families")).toBeChecked();
  await travel.getByRole("button", { name: "+ Add another hotel" }).click();
  await stays.last().getByLabel("Hotel", { exact: false }).first().fill("Bride Side Inn");
  await stays.last().getByLabel("Bride Side Inn is common for both families").uncheck();
  await expect(stays).toHaveCount(before + 2);
  if (shots) await travel.screenshot({ path: `${shots}/stays-editor.png` });
  await travel.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/saved=travel/);

  // the groom's family sees the shared one (and can edit it), not the bride's own
  await page.goto("/couple/site?family=groom");
  await expect(page.locator("#travel input[value='Shared Haveli']")).toBeVisible();
  await expect(page.locator("#travel input[value='Bride Side Inn']")).toHaveCount(0);

  const stay = (name: string) => page.getByRole("heading", { name, level: 3 });
  await page.goto("/w/gaurav-weds-karishma?side=groom");
  await expect(stay("Shared Haveli")).toBeAttached();
  await expect(stay("Bride Side Inn")).toHaveCount(0);
  await page.goto("/w/gaurav-weds-karishma?side=bride");
  await expect(stay("Shared Haveli")).toBeAttached();
  await expect(stay("Bride Side Inn")).toBeAttached();

  // a hotel can be removed
  await page.goto("/couple/site?family=bride");
  await page.locator("#travel").getByRole("button", { name: "Remove Bride Side Inn" }).click();
  await page.locator("#travel").getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/saved=travel/);
  await page.goto("/w/gaurav-weds-karishma?side=bride");
  await expect(stay("Bride Side Inn")).toHaveCount(0);
});

test("each family's site and section put its own child's name first", async ({ page }) => {
  await page.goto("/w/gaurav-weds-karishma?side=groom");
  await expect(page).toHaveTitle(/Gaurav weds Karishma/);
  await expect(page.locator("h1").first()).toHaveText(/Gaurav\s*with\s*Karishma/);
  await expect(page.locator("footer")).toContainText("Gaurav & Karishma");
  await page.goto("/w/gaurav-weds-karishma?side=bride");
  await expect(page).toHaveTitle(/Karishma weds Gaurav/);
  await expect(page.locator("h1").first()).toHaveText(/Karishma\s*with\s*Gaurav/);
  await page.goto("/w/gaurav-weds-karishma/rsvp?side=groom");
  await expect(page.getByRole("link", { name: /Gaurav & Karishma/ })).toBeVisible();

  await signIn(page, "couple2@example.com");
  await page.goto("/couple/groom");
  await expect(page.locator(".portal-nav-brand")).toHaveText("Gaurav & Karishma");
});

test("design touches: an opening screen, what falls, decorations and celebration icons", async ({ page }) => {
  await signIn(page, "couple2@example.com");
  await page.goto("/couple/site?family=groom");
  // the long editor has jump links
  await page.getByRole("navigation", { name: "Jump to" }).getByRole("link", { name: "Design touches" }).click();
  const decor = page.locator("#decor");
  await decor.getByText("Palace doors").click();
  await decor.getByLabel("Falling over the opening screen").selectOption("sparkles");
  await decor.getByLabel("Flourish between sections").selectOption("lotus");
  await decor.getByLabel(/Toran across the top/).check();
  await decor.getByLabel(/Corner motifs/).check();
  await decor.getByLabel(/Celebration icons/).check();
  await decor.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/saved=decor/);

  // guests first see the closed doors; one tap opens the invitation
  await page.goto("/w/gaurav-weds-karishma?side=groom");
  const doors = page.getByTestId("reveal");
  await expect(doors).toContainText("Gaurav & Karishma");
  await page.getByRole("button", { name: "Open the invitation" }).click();
  await expect(doors).toHaveCount(0);
  await expect(page.getByTestId("site-toran")).toBeVisible();
  await expect(page.getByTestId("site-corner")).toHaveCount(2); // the toran takes the top two corners
  await expect(page.locator("[data-falling=sparkles]")).toBeAttached();
  await expect(page.getByTestId("event-icon").first()).toBeAttached();
  // opened once per visit
  await page.reload();
  await expect(page.getByTestId("reveal")).toHaveCount(0);

  // the bride's family keeps its own (none of these)
  await page.goto("/w/gaurav-weds-karishma?side=bride");
  await expect(page.getByTestId("reveal")).toHaveCount(0);
  await expect(page.getByTestId("site-toran")).toHaveCount(0);
  await expect(page.getByTestId("event-icon")).toHaveCount(0);
});

