import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";

function latest(email: string, field: "signInUrl" | "confirmUrl"): string {
  const lines = fs.readFileSync("var/outbox/mail.jsonl", "utf8").trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = JSON.parse(lines[i]);
    if (m.to === email && m[field]) return m[field];
  }
  throw new Error(`no ${field} for ${email}`);
}

/** A fresh couple of our own, so other tests' demo data is never touched. */
async function newCouple(page: Page, bride: string, groom: string) {
  const email = `e2e-${bride.toLowerCase()}-${Date.now()}@example.com`;
  await page.goto("/start");
  await page.fill("input[name=brideName]", bride);
  await page.fill("input[name=groomName]", groom);
  await page.fill("input[name=weddingDate]", "2027-03-03");
  await page.fill("input[name=city]", "Pune");
  await page.fill("input[name=email]", email);
  await page.click("button[type=submit]");
  await expect(page.getByText(/check your inbox/i)).toBeVisible();
  await page.goto(latest(email, "signInUrl"));
  await expect(page).toHaveURL(/\/couple\/site/);
  return email;
}

const shots = process.env.SHOTS_DIR;

test("a couple resets chosen parts after confirming by email", async ({ page }) => {
  const email = await newCouple(page, "Isha", "Rohan");
  await page.getByRole("button", { name: "+ Haldi" }).click();
  await expect(page.getByText("2 events", { exact: true })).toBeVisible();

  // reset and delete live on the main dashboard
  await page.goto("/couple");
  const danger = page.locator("#danger");
  await danger.getByLabel(/Celebrations/).check();
  await danger.getByRole("button", { name: "Reset selected…" }).click();
  if (shots) { await danger.scrollIntoViewIfNeeded(); await danger.screenshot({ path: `${shots}/danger-reset.png` }); }
  await danger.getByRole("button", { name: "Email me the confirmation link" }).click();
  await expect(danger.getByText(/sent a confirmation link to/)).toBeVisible();

  // nothing has changed yet
  await page.goto("/couple/site");
  await expect(page.getByText("2 events", { exact: true })).toBeVisible();

  // the emailed link only shows a page; the button does the work
  await page.goto(latest(email, "confirmUrl"));
  await expect(page.getByRole("heading", { name: "Reset your wedding website?" })).toBeVisible();
  await expect(page.getByText(/back to just the wedding day/)).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/confirm-reset.png`, fullPage: true });
  const confirmUrl = page.url();
  await page.getByRole("button", { name: "Yes, reset these" }).click();
  await expect(page.getByRole("heading", { name: /has been reset/ })).toBeVisible();

  await page.goto("/couple/site");
  await expect(page.getByText("1 event", { exact: true })).toBeVisible();

  // the same link can't be used twice
  await page.goto(confirmUrl);
  await expect(page.getByRole("heading", { name: /already been used/ })).toBeVisible();
});

test("a couple deletes their wedding after confirming by email", async ({ page }) => {
  const email = await newCouple(page, "Tara", "Kabir");
  await page.goto("/couple");
  const danger = page.locator("#danger");
  await danger.getByRole("button", { name: "Delete wedding website…" }).click();
  const send = danger.getByRole("button", { name: "Email me the confirmation link" });
  await expect(send).toBeDisabled();
  await danger.getByLabel("I understand this can't be undone").check();
  if (shots) await danger.screenshot({ path: `${shots}/danger-delete.png` });
  await send.click();
  await expect(danger.getByText(/sent a confirmation link to/)).toBeVisible();

  await page.goto("/w/tara-weds-kabir");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Tara");

  await page.goto(latest(email, "confirmUrl"));
  await expect(page.getByRole("heading", { name: "Delete your wedding website?" })).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/confirm-delete.png`, fullPage: true });
  await page.getByRole("button", { name: "Yes, delete everything" }).click();
  await expect(page.getByRole("heading", { name: /has been deleted/ })).toBeVisible();

  // the site is gone, and so is the login
  const res = await page.goto("/w/tara-weds-kabir");
  expect(res?.status()).toBe(404);
  await page.goto("/couple/site");
  await expect(page).toHaveURL(/\/signin/);
});
