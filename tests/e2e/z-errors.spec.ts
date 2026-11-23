import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";

/* When things go wrong: an address that doesn't exist gets a friendly page,
   and a save that can't reach the server keeps what was typed and says so. */

function latestSignIn(email: string): string {
  const lines = fs.readFileSync("var/outbox/mail.jsonl", "utf8").trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = JSON.parse(lines[i]);
    if (m.to === email && m.signInUrl) return m.signInUrl;
  }
  throw new Error(`no sign-in link for ${email}`);
}

async function newCouple(page: Page) {
  const email = `e2e-errors-${Date.now()}@example.com`;
  await page.goto("/start");
  await page.fill("input[name=brideName]", "Pooja Kumari");
  await page.fill("input[name=groomName]", "Spandan Kosambi");
  await page.locator("label:has(input[name=you][value=groom])").click();
  await page.fill("input[name=weddingDate]", "2027-03-03");
  await page.fill("input[name=city]", "Pune");
  await page.fill("input[name=email]", email);
  await page.click("button[type=submit]");
  await expect(page.getByText(/check your inbox/i)).toBeVisible();
  await page.goto(latestSignIn(email));
  await expect(page).toHaveURL(/\/couple\/site/);
}

test("an address that doesn't exist: a friendly page, with a way home", async ({ page }) => {
  const res = await page.goto("/no-such-page-here");
  expect(res?.status()).toBe(404);
  const screen = page.getByTestId("error-screen");
  await expect(screen.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
  await screen.getByRole("link", { name: "Go to the home page" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("a save that can't reach the server keeps the change and says so", async ({ page, context }) => {
  test.setTimeout(150_000);
  await newCouple(page);
  await page.goto("/couple/site?family=bride");
  const save = page.getByTestId("floating-save");
  const story = page.locator("#words textarea[name=story]");
  await story.fill("We met in Udaipur.");
  await expect(save).toHaveText("Save changes");

  await context.setOffline(true);
  await save.click();
  await expect(page.getByTestId("floating-save-error")).toHaveText("Couldn't reach the server. Please check your connection and try again.");
  // nothing lost: the text is still there and still marked unsaved
  await expect(story).toHaveValue("We met in Udaipur.");
  await expect(save).toHaveText("Save changes");
  await expect(save).toBeEnabled();

  // back online, the same press saves it
  await context.setOffline(false);
  await save.click();
  await expect(save).toHaveText("All changes saved");
  await expect(page.getByTestId("floating-save-error")).toHaveCount(0);
  await page.reload();
  await expect(story).toHaveValue("We met in Udaipur.");
});
