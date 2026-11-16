import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";

/* Uses the second demo wedding (Karishma & Gaurav), bride's side. */

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

test("motion, a scene, the curtain and things to know reach the guest site", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1366, height: 800 });
  await signIn(page, "couple2@example.com");
  await page.goto("/couple/site?family=bride");
  const decor = page.locator("#decor");
  await decor.getByText("Lively", { exact: true }).click();
  await decor.getByText("Night sky", { exact: true }).click();
  await decor.getByText("Paper-cut curtain", { exact: true }).click();
  await decor.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/saved=decor/);

  // things to know: a suggestion fills the title; a half-filled note is refused
  const know = page.locator("#know");
  await know.getByRole("button", { name: "+ Parking" }).click();
  await know.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("Each note needs a title and a few words");
  await page.locator("#know").getByRole("button", { name: "+ Parking" }).click();
  await page.locator("#know").getByLabel("What guests should know about Parking").fill("Valet at the main gate.");
  await page.locator("#know").getByRole("button", { name: "+ Weather" }).click();
  await page.locator("#know").getByLabel("What guests should know about Weather").fill("Cool evenings; bring a shawl.");
  await page.locator("#know").getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/saved=know/);
  // music needs file storage, which this test site doesn't have
  await expect(page.locator("#music")).toContainText("up to 4 MB");

  // ── the guest site ──
  await page.goto("/w/gaurav-weds-karishma?side=bride&k=sample");
  const curtain = page.getByTestId("reveal");
  await expect(curtain.locator(".reveal-drape")).toHaveCount(6);
  if (shots) await page.screenshot({ path: `${shots}/curtain.png` });
  await page.getByRole("button", { name: "Open the invitation" }).click();
  await expect(curtain).toHaveCount(0);
  await expect(page.locator("main")).toHaveAttribute("data-motion", "lively");
  await expect(page.getByTestId("scene")).toHaveAttribute("data-scene", "night");
  await page.waitForTimeout(1200);
  if (shots) await page.screenshot({ path: `${shots}/scene-night.png` });
  const notes = page.getByTestId("things-to-know");
  await notes.scrollIntoViewIfNeeded();
  await expect(notes.getByRole("heading", { name: "Parking" })).toBeVisible();
  await expect(notes).toContainText("Cool evenings; bring a shawl.");
  await page.waitForTimeout(1300);
  if (shots) await page.screenshot({ path: `${shots}/know.png` });
  // nothing pushes the page sideways, on a laptop or a phone
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/w/gaurav-weds-karishma?side=bride&k=sample");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (shots) await page.screenshot({ path: `${shots}/scene-phone.png` });

  // the other scenes, and "Still"
  for (const [scene, label] of [["garden", "Garden"], ["palace", "Palace"]] as const) {
    await page.setViewportSize({ width: 1366, height: 800 });
    await page.goto("/couple/site?family=bride");
    await page.locator("#decor").getByText(label, { exact: true }).click();
    await page.locator("#decor").getByText("Straight to the site", { exact: true }).click();
    await page.locator("#decor").getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/saved=decor/);
    await page.goto("/w/gaurav-weds-karishma?side=bride&k=sample");
    await expect(page.getByTestId("scene")).toHaveAttribute("data-scene", scene);
    await page.waitForTimeout(1500);
    if (shots) await page.screenshot({ path: `${shots}/scene-${scene}.png` });
  }
  await page.goto("/couple/site?family=bride");
  await page.locator("#decor").getByText("Still", { exact: true }).click();
  await page.locator("#decor").getByText("No scene", { exact: true }).click();
  await page.locator("#decor").getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/saved=decor/);
  await page.goto("/w/gaurav-weds-karishma?side=bride&k=sample");
  await expect(page.locator("main")).toHaveAttribute("data-motion", "none");
  await expect(page.getByTestId("scene")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.classList.contains("fx"))).toBe(false);
  await expect(page.getByRole("heading", { name: "Things to know" })).toBeVisible(); // nothing waits to fade in
  // the groom's side is untouched
  await page.goto("/w/gaurav-weds-karishma?side=groom&k=sample");
  await expect(page.getByTestId("things-to-know")).toHaveCount(0);
});
