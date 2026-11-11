import { test, expect } from "@playwright/test";
import fs from "node:fs";

/** The seeded family's personal token (the seed prints their /rsvp/ link). */
function tokenOf(family: string) {
  const line = fs.readFileSync("var/e2e-seed.txt", "utf8").split("\n").find((l) => l.startsWith(`${family}:`));
  if (!line) throw new Error(`no seed line for ${family}`);
  return line.split("/rsvp/")[1].trim();
}

test("an invitation opens the wedding site first, then leads to the family's own RSVP", async ({ page }) => {
  const token = tokenOf("The Guptas");
  await page.goto(`/w/ananya-weds-arjun?invite=${token}`);

  // it's the couple's site, greeting the household by name
  await expect(page.getByText(/Ananya/i).first()).toBeVisible();
  const bar = page.getByTestId("invite-bar");
  await expect(bar).toContainText("Dear The Guptas, you're invited");
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/invite-site.png` });

  // the RSVP section speaks to them, and its button opens their personal page
  const section = page.locator("#rsvp");
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByRole("heading", { name: "Will The Guptas be joining us?" })).toBeVisible();
  await expect(bar).toHaveAttribute("inert", ""); // steps aside while the section shows
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/invite-rsvp-section.png` });
  await section.getByRole("link", { name: "Confirm your attendance" }).click();
  await expect(page).toHaveURL(new RegExp(`/rsvp/${token}$`));
  await expect(page.getByRole("heading", { name: "Dear The Guptas," })).toBeVisible();

  // and back to the site, still personal
  await page.getByRole("link", { name: "← The wedding site" }).click();
  await expect(page).toHaveURL(new RegExp(`/w/ananya-weds-arjun\\?invite=${token}$`));
  await expect(page.getByTestId("invite-bar")).toBeVisible();

  // the floating bar goes straight to their RSVP too
  await page.getByTestId("invite-bar").getByRole("link", { name: "RSVP" }).click();
  await expect(page).toHaveURL(new RegExp(`/rsvp/${token}$`));
});

test("a family that has replied is offered their answers, not a fresh RSVP", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); // a phone, where most invitations are opened
  await page.goto(`/w/ananya-weds-arjun?invite=${tokenOf("The Iyers")}`);
  await expect(page.getByTestId("invite-bar").getByRole("link", { name: "Your RSVP" })).toBeVisible();
  if (process.env.SHOTS_DIR) {
    await page.waitForTimeout(2500); // let the opening animation settle
    await page.screenshot({ path: `${process.env.SHOTS_DIR}/invite-phone.png` });
  }
  await expect(page.locator("#rsvp").getByRole("link", { name: "See or change your RSVP" })).toBeAttached();
});

test("an old, wrong or other wedding's code just shows the ordinary site", async ({ page }) => {
  await page.goto("/w/ananya-weds-arjun?invite=not-a-real-invitation-code-at-all");
  await expect(page.getByText(/Ananya/i).first()).toBeVisible();
  await expect(page.getByTestId("invite-bar")).toHaveCount(0);
  await expect(page.locator("#rsvp").getByRole("link", { name: "Confirm your attendance" })).toHaveAttribute("href", "/w/ananya-weds-arjun/rsvp?side=bride"); // the bride's family's look

  await page.goto(`/w/gaurav-weds-karishma?invite=${tokenOf("The Guptas")}`);
  await expect(page.getByTestId("invite-bar")).toHaveCount(0);
});

test("each household's site shows only their celebrations, and Travel & Stay only when it's theirs", async ({ page }) => {
  const celebration = (name: string) => page.getByRole("heading", { name, level: 3, exact: true });
  const travel = page.getByRole("heading", { name: "Travel & Stay", level: 2 });

  // The Guptas are invited to 3 of the 5 events: just those, and no travel
  await page.goto(`/w/ananya-weds-arjun?invite=${tokenOf("The Guptas")}`);
  await expect(celebration("Sangeet")).toBeAttached();
  await expect(celebration("Pheras")).toBeAttached();
  await expect(celebration("Reception")).toBeAttached();
  await expect(celebration("Haldi")).toHaveCount(0);
  await expect(celebration("Mehendi")).toHaveCount(0);
  await expect(travel).toHaveCount(0);

  // the Sharmas are invited to everything, so Travel & Stay shows on its own
  await page.goto(`/w/ananya-weds-arjun?invite=${tokenOf("Sharma Family")}`);
  await expect(celebration("Haldi")).toBeAttached();
  await expect(travel).toBeAttached();

  // the general site is unchanged
  await page.goto("/w/ananya-weds-arjun");
  await expect(celebration("Haldi")).toBeAttached();
  await expect(travel).toBeAttached();
});
