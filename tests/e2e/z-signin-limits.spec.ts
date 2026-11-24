import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";

/* Sign-in links are limited to 3 per address per 15 minutes, on the sign-in
   page and on a direct POST to Auth.js's own route alike. (Test accounts at
   @example.com are exempt in tests only; these use other addresses.) */

const signInLinksTo = (email: string) =>
  fs.readFileSync("var/outbox/mail.jsonl", "utf8").trim().split("\n")
    .map((l) => JSON.parse(l)).filter((m) => m.to === email && m.signInUrl).length;

async function askOnPage(page: Page, email: string) {
  await page.goto("/signin");
  await page.fill("input[name=email]", email);
  await page.click("button[type=submit]");
}

test("the sign-in page says 'please wait' after 3 requests, the same for any address", async ({ page }) => {
  // an address with no account: the answer must look the same as for one with an account
  for (let i = 0; i < 3; i++) {
    await askOnPage(page, "nobody-here@site.org");
    await expect(page.getByText(/on its way/i)).toBeVisible();
  }
  await askOnPage(page, "nobody-here@site.org");
  const wait = page.getByRole("alert").filter({ hasText: "Please wait a few minutes before asking for another link" });
  await expect(wait).toBeVisible();
  await page.setViewportSize({ width: 375, height: 700 });
  await expect(wait).toBeVisible();
});

test("a direct POST to /api/auth can't get past the limit either", async ({ page }) => {
  // a real couple, so links do go out (the sign-up sends the first)
  const email = `limit-${Date.now()}@site.org`;
  await page.goto("/start");
  await page.fill("input[name=brideName]", "Mira");
  await page.fill("input[name=groomName]", "Dev");
  await page.locator("label:has(input[name=you][value=bride])").click();
  await page.fill("input[name=weddingDate]", "2027-04-18");
  await page.fill("input[name=city]", "Pune");
  await page.fill("input[name=email]", email);
  await page.click("button[type=submit]");
  await expect(page.getByText(/check your inbox/i)).toBeVisible();
  expect(signInLinksTo(email)).toBe(1);

  const post = async () => {
    const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json();
    const res = await page.request.post("/api/auth/signin/nodemailer", { form: { email, csrfToken, callbackUrl: "/go" }, maxRedirects: 0 });
    return res.headers()["location"] ?? "";
  };
  expect(await post()).not.toContain("error=");
  expect(await post()).not.toContain("error=");
  expect(signInLinksTo(email)).toBe(3);
  // the 4th is refused, and nothing is sent
  expect(await post()).toContain("/signin?error=");
  expect(signInLinksTo(email)).toBe(3);
  // and the page it lands on is friendly
  await page.goto("/signin?error=AccessDenied");
  await expect(page.getByRole("alert").filter({ hasText: "please wait a few minutes" })).toBeVisible();
});
