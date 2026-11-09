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

test("an event can be one side's own, and households only see their side's events", async ({ page }) => {
  await signIn(page, "couple2@example.com");

  // ── the couple makes the Mehendi the bride's own ─────────────
  await page.goto("/couple/site");
  const mehendi = page.locator("details", { has: page.getByText("Mehendi", { exact: true }) }).first();
  await mehendi.locator("summary").click();
  const common = mehendi.getByLabel("Mehendi is common for bride and groom");
  await expect(common).toBeChecked();
  await common.uncheck();
  await expect(mehendi.getByRole("radiogroup", { name: "Whose Mehendi is this?" })).toBeVisible();
  await mehendi.getByText("Bride's side", { exact: true }).click();
  if (shots) await mehendi.screenshot({ path: `${shots}/event-side.png` });
  await mehendi.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved. Your site is up to date.")).toBeVisible();
  await expect(mehendi.locator("summary").getByText("Bride's side")).toBeVisible();

  // ── the guest list follows ───────────────────────────────────
  await page.goto("/committee");
  // the groom's parents were invited to everything; the bride's Mehendi isn't theirs any more
  const saxena = page.getByRole("row", { name: /Saxena Family/ });
  await expect(saxena.getByText(/Sangeet/)).toBeVisible();
  await expect(saxena.getByText(/Mehendi/)).toHaveCount(0);
  await expect(page.getByRole("row", { name: /Malhotra Family/ }).getByText(/Mehendi · Bride/)).toBeVisible();

  // the family form offers only common events and the family's own side's
  await page.getByRole("button", { name: "Add family" }).click();
  const dialog = page.getByRole("dialog");
  const side = dialog.getByRole("combobox").first();
  await side.selectOption("groom");
  await expect(dialog.getByRole("button", { name: "Sangeet" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Mehendi/ })).toHaveCount(0);
  await expect(dialog.getByText("Showing common and groom's-side events.")).toBeVisible();
  await side.selectOption("bride");
  await dialog.getByRole("button", { name: "Mehendi · Bride" }).click();
  await expect(dialog.getByRole("button", { name: "Mehendi · Bride" })).toHaveAttribute("aria-pressed", "true");
  if (shots) await page.screenshot({ path: `${shots}/family-side-events.png` });
  // switching to the groom's side drops it
  await side.selectOption("groom");
  await expect(dialog.getByRole("button", { name: /Mehendi/ })).toHaveCount(0);
  await side.selectOption("both"); // both sides: every event, Mehendi not picked
  await expect(dialog.getByRole("button", { name: "Mehendi · Bride" })).toHaveAttribute("aria-pressed", "false");

  // ── guests see whose it is ───────────────────────────────────
  await page.goto("/w/gaurav-weds-karishma");
  const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Mehendi", level: 3 }) });
  await expect(card.getByText("Bride's side")).toBeVisible();
});
