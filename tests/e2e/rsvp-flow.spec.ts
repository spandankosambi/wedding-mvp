import { test, expect } from "@playwright/test";
import fs from "node:fs";

test("guest RSVPs via emailed link; public site renders", async ({ page }) => {
  const out = fs.readFileSync("var/e2e-seed.txt", "utf8");
  // "The Khans" is seed index 7 — outside the first 7 families that get
  // pre-seeded RSVPs, so this family starts un-responded (required for the
  // prefill assertion below).
  const url = out.split("\n").find((l) => l.startsWith("The Khans:"))!.split(": ")[1].trim();

  await page.goto(url);
  await expect(page.getByText(/Khan/i).first()).toBeVisible();
  await expect(page.getByText(/Sangeet/i).first()).toBeVisible();

  // Attending the first event: the household's own names are listed, all
  // ticked — they can only answer for people on their list
  const cards = page.getByTestId("event-card");
  await cards.nth(0).getByRole("button", { name: /attending/i }).click();
  await expect(cards.nth(0).getByText("Who's coming · 2 of 2")).toBeVisible();
  await cards.nth(0).getByLabel("Imran Khan is coming to Sangeet").uncheck({ force: true });
  await expect(cards.nth(0).getByText("Who's coming · 1 of 2")).toBeVisible();
  await cards.nth(1).getByRole("button", { name: /decline/i }).click();
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/guest-rsvp.png`, fullPage: true });
  await page.getByRole("button", { name: /send rsvp/i }).click();
  await expect(page.getByText(/see you/i)).toBeVisible();

  // Revisit link → previous answers prefilled
  await page.goto(url);
  await expect(cards.nth(0).getByRole("button", { name: /attending/i })).toHaveAttribute("aria-pressed", "true");
  await expect(cards.nth(1).getByRole("button", { name: /decline/i })).toHaveAttribute("aria-pressed", "true");
  await expect(cards.nth(0).getByText("Who's coming · 1 of 2")).toBeVisible(); // remembered by name

  // Public site renders themed sections
  await page.goto("/w/ananya-weds-arjun");
  await expect(page.getByText(/Ananya/i).first()).toBeVisible();
  await expect(page.getByText(/Reception/i).first()).toBeVisible();
});
