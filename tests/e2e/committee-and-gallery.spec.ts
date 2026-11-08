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

  // ── RSVP on their behalf: tick names; someone extra is added by name ──
  await row.getByRole("button", { name: /Record RSVP for The Desais/ }).click();
  const cards = page.getByTestId("committee-rsvp-event");
  await expect(cards).toHaveCount(2);
  await cards.nth(0).getByRole("radio", { name: "Attending", exact: true }).click();
  await expect(cards.nth(0).getByText("2 coming")).toBeVisible();
  await page.getByLabel("New guest's full name").fill("Meera Desai");
  await page.getByRole("button", { name: "+ Add guest" }).click();
  await expect(cards.nth(0).getByText("3 coming")).toBeVisible();
  await cards.nth(0).getByLabel("Asha Desai coming to Sangeet").uncheck();
  await cards.nth(1).getByRole("radio", { name: "Not attending" }).click();
  if (shots) await page.screenshot({ path: `${shots}/rsvp-editor.png`, fullPage: true });
  await page.getByRole("button", { name: "Save RSVP" }).click();
  await expect(page.getByText("RSVP saved for The Desais")).toBeVisible();
  await expect(row.getByText("Sangeet ✓2")).toBeVisible();
  await expect(row.getByText("Reception ✗")).toBeVisible();
  await expect(row.getByRole("cell", { name: "3", exact: true })).toBeVisible(); // Meera joined the family

  // ── the same family in the Guests view, with a custom column ──
  await page.getByRole("link", { name: /^Guests/ }).click();
  await expect(page).toHaveURL(/view=guests/);
  const nikhil = page.getByRole("row", { name: /Nikhil Desai/ });
  await expect(nikhil.getByText("Sangeet ✓")).toBeVisible();
  await expect(page.getByRole("row", { name: /Asha Desai/ }).getByText("Sangeet ✗")).toBeVisible();
  await page.getByRole("button", { name: "+ Add column" }).click();
  await page.getByLabel("New column name").fill("Room no.");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("columnheader", { name: /Room no\./ })).toBeVisible();
  const room = page.getByLabel("Room no. for Nikhil Desai");
  await room.fill("204");
  await room.press("Enter");
  await expect(room).toHaveCSS("opacity", "1"); // save finished
  // per-guest RSVP and multi-select
  await page.getByLabel("Select Asha Desai").check();
  await page.getByLabel("Select Meera Desai").check();
  await page.getByRole("button", { name: "Mark RSVP…" }).click();
  await page.getByRole("dialog").getByRole("radio").first().check();
  if (shots) await page.screenshot({ path: `${shots}/bulk-rsvp.png` });
  await page.getByRole("button", { name: "Mark 2 guests" }).click();
  await expect(page.getByText("RSVP marked for 2 guests")).toBeVisible();
  await expect(page.getByRole("row", { name: /Asha Desai/ }).getByText("Sangeet ✓")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Room no. for Nikhil Desai")).toHaveValue("204");
  if (shots) await page.screenshot({ path: `${shots}/guest-view.png`, fullPage: true });
  await page.getByRole("link", { name: /^Families/ }).click();
  await expect(row.getByText("Sangeet ✓3")).toBeVisible();

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
