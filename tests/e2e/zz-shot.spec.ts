import { test, expect } from "@playwright/test";
import fs from "node:fs";
const url = (email: string) => { const l = fs.readFileSync("var/outbox/mail.jsonl", "utf8").trim().split("\n").map((x) => JSON.parse(x)).filter((m) => m.to === email && m.signInUrl); return l[l.length - 1].signInUrl; };
test("shots", async ({ page }) => {
  test.setTimeout(200_000);
  await page.setViewportSize({ width: 375, height: 700 });
  for (const email of ["couple2@example.com", "couple@example.com"]) {
    await page.goto("/signin"); await page.fill("input[name=email]", email); await page.click("button[type=submit]");
    await expect(page.getByText(/on its way/i)).toBeVisible();
    await page.goto(url(email));
    await page.goto("/couple");
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible({ timeout: 60_000 });
    const box = async (s: string) => (await page.locator(s).first().boundingBox())!;
    console.log("BASE", email, "signout y", (await box(".portal-nav-out")).y, "logo y", (await box(".portal-nav-logo")).y, "row width used", (await box(".portal-nav-out")).x + (await box(".portal-nav-out")).width);
    await page.context().clearCookies();
  }
});
