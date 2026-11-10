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
