import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";

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

test("committee adds a family by name, records their RSVP, then deletes them", async ({ page }) => {
  await signIn(page, "committee@example.com");
  await page.goto("/committee");

  // ── add a family: the guest name box is usable ─────────────
  await page.getByRole("button", { name: "Add family" }).click();
  await page.fill("input[placeholder='Sharma Family']", "The Desais");
  await page.fill("input[type=email]", "desai@example.com");
  const name1 = page.getByLabel("Guest 1 name");
  expect((await name1.boundingBox())!.width).toBeGreaterThan(200);
  await name1.fill("Nikhil Desai");
  await page.getByText("+ add another guest").click();
  await page.getByLabel("Guest 2 name").fill("Asha Desai");
  await page.getByRole("dialog").getByRole("button", { name: "Sangeet" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reception" }).click();
  if (shots) await page.screenshot({ path: `${shots}/add-family.png` });
  await page.getByRole("button", { name: "Save family" }).click();
  const row = page.getByRole("row", { name: /The Desais/ });
  await expect(row).toBeVisible();

  // ── RSVP on their behalf ───────────────────────────────────
  await row.getByRole("button", { name: /Record RSVP for The Desais/ }).click();
  const cards = page.getByTestId("committee-rsvp-event");
  await expect(cards).toHaveCount(2);
  await cards.nth(0).getByRole("radio", { name: "Attending", exact: true }).click();
  await cards.nth(0).getByLabel(/headcount/).fill("2");
  await cards.nth(1).getByRole("radio", { name: "Not attending" }).click();
  if (shots) await page.screenshot({ path: `${shots}/rsvp-editor.png` });
  await page.getByRole("button", { name: "Save RSVP" }).click();
  await expect(page.getByText("RSVP saved for The Desais")).toBeVisible();
  await expect(row.getByText("Sangeet ✓2")).toBeVisible();
  await expect(row.getByText("Reception ✗")).toBeVisible();

  // ── delete the family ──────────────────────────────────────
  await row.getByRole("button", { name: "edit" }).click();
  await page.getByRole("button", { name: "Delete family" }).click();
  if (shots) await page.screenshot({ path: `${shots}/delete-confirm.png` });
  await page.getByRole("button", { name: "Yes, delete family" }).click();
  await expect(page.getByRole("row", { name: /The Desais/ })).toHaveCount(0);
});

test("the couple can switch the gallery off and back on", async ({ page }) => {
  await signIn(page, "couple@example.com");
  await page.goto("/couple/site#gallery");
  const gallery = page.locator("#gallery");
  await expect(gallery.getByText(/decorative illustrations/)).toBeVisible();
  if (shots) { await gallery.scrollIntoViewIfNeeded(); await gallery.screenshot({ path: `${shots}/gallery-editor.png` }); }

  await page.goto("/w/ananya-weds-arjun");
  await expect(page.getByRole("heading", { name: "Gallery" })).toBeVisible();

  await page.goto("/couple/site#gallery");
  await gallery.locator("input[name=galleryEnabled]").uncheck();
  await gallery.getByRole("button", { name: /save/i }).click();
  await expect(page).toHaveURL(/saved=gallery/);
  await page.goto("/w/ananya-weds-arjun");
  await expect(page.getByRole("heading", { name: "Gallery" })).toHaveCount(0);

  await page.goto("/couple/site#gallery");
  await gallery.locator("input[name=galleryEnabled]").check();
  await gallery.getByRole("button", { name: /save/i }).click();
  await expect(page).toHaveURL(/saved=gallery/);
  await page.goto("/w/ananya-weds-arjun");
  await expect(page.getByRole("heading", { name: "Gallery" })).toBeVisible();
});

test("the couple can get from the guest list back to their dashboard", async ({ page }) => {
  await signIn(page, "couple@example.com");
  await page.goto("/committee");
  await page.getByRole("link", { name: "← Back to dashboard" }).click();
  await expect(page).toHaveURL(/\/couple$/);
});
