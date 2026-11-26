import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";

/* Page tours, on a phone. (Starting by themselves is switched off in tests so
   they don't cover what other tests click; here they're opened with "?".) */

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
/** walk a tour to the end; the titles it showed */
async function walk(page: Page) {
  const tour = page.getByTestId("tour");
  const titles: string[] = [];
  for (let n = 0; n < 10; n++) {
    await expect(tour.getByRole("dialog")).toBeVisible();
    titles.push((await tour.locator("#tour-title").textContent()) ?? "");
    const done = tour.getByRole("button", { name: "Done" });
    if (await done.count()) { await done.click(); break; }
    await tour.getByRole("button", { name: "Next" }).click();
  }
  await expect(tour).toHaveCount(0);
  return titles;
}

test("the couple's overview tour, on a phone", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 800 });
  await signIn(page, "couple@example.com");
  await page.goto("/couple");
  await page.getByRole("button", { name: "Show me around this page" }).click();
  const tour = page.getByTestId("tour");
  await expect(tour.getByRole("dialog")).toContainText("Welcome to your wedding workspace");
  await expect(tour).toContainText(/1 of \d/);
  await tour.getByRole("button", { name: "Next" }).click();
  await expect(tour.locator("#tour-title")).toHaveText("Replies at a glance");
  if (shots) { await page.waitForTimeout(900); await page.screenshot({ path: `${shots}/tour-phone.png` }); }
  // back, and the keyboard
  await tour.getByRole("button", { name: "Back" }).click();
  await expect(tour.locator("#tour-title")).toHaveText("Welcome to your wedding workspace");
  await page.keyboard.press("ArrowRight");
  await expect(tour.locator("#tour-title")).toHaveText("Replies at a glance");
  await page.keyboard.press("Escape");
  await expect(tour).toHaveCount(0);
  // all the way through
  await page.getByRole("button", { name: "Show me around this page" }).click();
  const titles = await walk(page);
  expect(titles).toContain("Bring in your helpers");
  expect(titles[titles.length - 1]).toBe("Help is always here");
  // the page works normally afterwards
  await page.getByRole("link", { name: "Plan", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Plan", exact: true })).toBeVisible();
});

test("a committee member's tour leaves out what's only for the couple", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 800 });
  await signIn(page, "committee@example.com");
  await page.goto("/couple");
  await page.getByRole("button", { name: "Show me around this page" }).click();
  const titles = await walk(page);
  expect(titles).not.toContain("Bring in your helpers");
  expect(titles).not.toContain("Names, date and city");
  // the guest list tour points at the real buttons
  await page.goto("/committee?family=bride");
  await page.getByRole("button", { name: "Show me around this page" }).click();
  const g = await walk(page);
  expect(g).toEqual(expect.arrayContaining(["Replies so far", "Three ways to look", "Add a family", "Send invitations"]));
});

test("every page's tour opens, on a laptop", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await signIn(page, "couple@example.com");
  for (const [url, first] of [
    ["/couple/bride", "Your family's link"],
    ["/couple/site?family=bride", "Your family's website"],
    ["/committee/import?family=bride", "Three short steps"],
    ["/couple/people", "Who can sign in"],
    ["/couple/bride/print", "Two steps to print-ready cards"],
    ["/couple/bride/print/words?lang=gu", "Pick the language"],
    ["/couple/plan", "Three spaces"],
  ] as const) {
    await page.goto(url);
    await page.getByRole("button", { name: "Show me around this page" }).click();
    await expect(page.getByTestId("tour").locator("#tour-title")).toHaveText(first);
    if (shots && url === "/couple/plan") {
      await page.getByTestId("tour").getByRole("button", { name: "Next" }).click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${shots}/tour-desktop.png` });
    }
    await page.keyboard.press("Escape");
  }
});
