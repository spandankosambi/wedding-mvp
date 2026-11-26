import { test, expect, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";

/* Rishta Corner end to end, on a phone: two households start profiles, each
   single opens theirs with an emailed code and publishes it, the host
   approves, they match and introduce their families. */

type Mail = { to: string; subject: string; html?: string; rsvpUrl?: string; signInUrl?: string };
function latest(to: string, pick: (m: Mail) => boolean): Mail {
  const lines = fs.readFileSync("var/outbox/mail.jsonl", "utf8").trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = JSON.parse(lines[i]) as Mail;
    if (m.to === to && pick(m)) return m;
  }
  throw new Error(`no matching email for ${to}`);
}
const seedLink = (name: string) => fs.readFileSync("var/e2e-seed.txt", "utf8").split("\n").find((l) => l.startsWith(`${name}:`))!.split(": ")[1].trim();
const phone = { width: 375, height: 800 };
const shots = process.env.SHOTS_DIR;
const ist = (days = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() + days * 86_400_000));

/** open a page and let it finish loading, so buttons work when tapped */
async function go(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}
async function signIn(page: Page, email: string) {
  await go(page, "/signin");
  await page.fill("input[name=email]", email);
  await page.click("button[type=submit]");
  await expect(page.getByText(/on its way/i)).toBeVisible();
  await go(page, latest(email, (m) => !!m.signInUrl).signInUrl!);
}
async function phonePage(browser: Browser) {
  const ctx = await browser.newContext({ viewport: phone });
  return ctx.newPage();
}

async function draft(page: Page, household: string, f: { name: string; gender: "A woman" | "A man"; meet: "A woman" | "A man"; year: string; email: string; phone?: string }) {
  await go(page, seedLink(household));
  await page.getByTestId("rishta-card").click();
  await page.waitForURL(/\/rishta$/);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Rishta Corner" })).toBeVisible();
  await page.getByLabel("First name").fill(f.name);
  await page.getByLabel("Year of birth").fill(f.year);
  await page.getByRole("group", { name: "They are" }).getByText(f.gender).click();
  await page.getByRole("group", { name: "They'd like to meet" }).getByText(f.meet).click();
  await page.getByLabel("City").fill("Pune");
  await page.getByLabel("Works as").fill("Architect");
  if (f.phone) {
    await page.getByLabel(/Family contact's name/).fill(`${f.name}'s mother`);
    await page.getByLabel("Their phone").fill(f.phone);
  }
  await page.getByLabel("Their own email address").fill(f.email);
  if (shots) await page.screenshot({ path: `${shots}/rishta-household-form.png`, fullPage: true });
  await page.getByRole("button", { name: "Save and send to them" }).click();
  await expect(page.getByRole("status")).toContainText("Sent.");
  await expect(page.getByText(`Waiting for ${f.name} to open it.`)).toBeVisible();
}

async function openAndPublish(browser: Browser, email: string, name: string) {
  const page = await phonePage(browser);
  const link = latest(email, (m) => !!m.rsvpUrl?.includes("/rishta/me/")).rsvpUrl!;
  await go(page, new URL(link).pathname); // the app address may differ locally
  // nothing of the profile shows before the code
  await expect(page.getByText(`Hello ${name}`)).toBeVisible();
  await expect(page.getByText("Architect")).toHaveCount(0);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByRole("status")).toContainText("6-digit code");
  await page.getByLabel("The code from the email").fill("000000");
  await page.getByRole("button", { name: "Open my profile" }).click();
  await expect(page.getByText(/That code isn't right/)).toBeVisible();
  const code = latest(email, (m) => m.subject === "Your Rishta Corner code").html!.match(/>(\d{6})</)![1];
  await page.getByLabel("The code from the email").fill(code);
  await page.getByRole("button", { name: "Open my profile" }).click();
  await expect(page.getByTestId("rishta-status")).toContainText("Not published yet");
  await expect(page.getByLabel("First name")).toHaveValue(name);
  // all three are needed
  await page.getByLabel(/This is me/).check();
  await page.getByLabel(/I'm unmarried/).check();
  await page.getByLabel(/I agree to be introduced/).check();
  if (shots) await page.screenshot({ path: `${shots}/rishta-publish.png`, fullPage: true });
  await page.getByRole("button", { name: "Publish my profile" }).click();
  await expect(page.getByTestId("rishta-status")).toContainText("Published.");
  return page;
}

test("Rishta Corner: draft, passcode, publish, approve, match, introduce", async ({ browser }) => {
  test.setTimeout(300_000);
  const run = Date.now().toString(36);
  const asha = `asha-${run}@example.org`, rohan = `rohan-${run}@example.org`;

  // the household's link shows nothing while it's switched off
  const house = await phonePage(browser);
  await go(house, seedLink("Sharma Family"));
  await expect(house.getByText(/Dear Sharma/i)).toBeVisible();
  await expect(house.getByTestId("rishta-card")).toHaveCount(0);

  // the couple can't switch it on themselves
  const couple = await phonePage(browser);
  await signIn(couple, "couple@example.com");
  await go(couple, "/couple/rishta");
  await expect(couple.getByText("Not switched on for your wedding yet")).toBeVisible();
  await expect(couple.getByRole("button", { name: "Switch on" })).toHaveCount(0);

  // admin switches it on and opens it from today
  const admin = await phonePage(browser);
  await signIn(admin, "admin@example.com");
  await go(admin, "/admin");
  const manage = await admin.getByRole("row", { name: /Ananya & Arjun/ }).getByRole("link", { name: "manage" }).getAttribute("href");
  const wid = manage!.split("/").pop()!;
  await go(admin, `/couple/rishta?wedding=${wid}`);
  if (await admin.getByRole("button", { name: "Switch on" }).count()) await admin.getByRole("button", { name: "Switch on" }).click();
  await expect(admin.getByRole("button", { name: "Switch off" })).toBeVisible();
  await admin.getByLabel("Opens").fill(ist(-1));
  await admin.getByLabel("Closes").fill(ist(20));
  await admin.getByRole("button", { name: "Save dates" }).click();
  await expect(admin.getByText("Dates saved.")).toBeVisible();

  // the shared family link and the site never show it
  await go(house, "/w/ananya-weds-arjun?k=sample");
  await expect(house.getByText(/Rishta/i)).toHaveCount(0);

  // two households start profiles
  await draft(house, "Sharma Family", { name: "Asha", gender: "A woman", meet: "A man", year: "1997", email: asha, phone: "98765 43210" });
  await draft(house, "Mehta Family", { name: "Rohan", gender: "A man", meet: "A woman", year: "1995", email: rohan, phone: "91234 56789" });

  // each single opens theirs with a code and publishes it
  const a = await openAndPublish(browser, asha, "Asha");
  const r = await openAndPublish(browser, rohan, "Rohan");

  // the household can't change it once it's theirs
  await go(house, `${seedLink("Sharma Family")}/rishta`);
  await expect(house.getByText(/Asha has published it/)).toBeVisible();
  await expect(house.getByRole("button", { name: "Edit" })).toHaveCount(0);

  // the host approves both
  await go(admin, admin.url());
  const queue = admin.getByRole("region", { name: "Waiting for you" });
  for (const n of ["Asha", "Rohan"]) {
    await queue.getByRole("article", { name: n }).getByRole("button", { name: "Approve" }).click();
    await expect(admin.getByText(`${n} is live.`)).toBeVisible();
  }

  // each sees the other; interest is private until it's mutual
  await go(a, `${a.url().split("?")[0]}?tab=people`);
  const rohanCard = a.getByRole("article", { name: "Rohan" });
  await expect(rohanCard).toBeVisible();
  await expect(rohanCard).not.toContainText("91234");
  if (shots) await a.screenshot({ path: `${shots}/rishta-people.png`, fullPage: true });
  await rohanCard.getByRole("button", { name: "Interested" }).click();
  await expect(rohanCard.getByRole("button", { name: /Interested ✓/ })).toBeVisible();

  await go(r, `${r.url().split("?")[0]}?tab=matches`);
  await expect(r.getByText("No matches yet.")).toBeVisible();
  await go(r, `${r.url().split("?")[0]}?tab=people`);
  await r.getByRole("article", { name: "Asha" }).getByRole("button", { name: "Interested" }).click();
  await go(r, `${r.url().split("?")[0]}?tab=matches`);
  const ashaMatch = r.getByRole("article", { name: "Asha" });
  await expect(ashaMatch.getByText("You're both interested.")).toBeVisible();
  await ashaMatch.getByRole("button", { name: "Introduce our families" }).click();
  await expect(ashaMatch.getByText(/Waiting for Asha/)).toBeVisible();
  await expect(ashaMatch).not.toContainText("98765");

  await go(a, `${a.url().split("?")[0]}?tab=matches`);
  await a.getByRole("article", { name: "Rohan" }).getByRole("button", { name: "Introduce our families" }).click();
  await expect(a.getByRole("article", { name: "Rohan" }).getByRole("link", { name: /9123456789/ })).toBeVisible();
  if (shots) await a.screenshot({ path: `${shots}/rishta-match.png`, fullPage: true });

  // the host sees counts, never who likes whom
  await go(couple, "/couple/rishta");
  await expect(couple.getByText("Matches").first()).toBeVisible();
  await expect(couple.locator("main")).not.toContainText(/Interested|Introduce/);
  if (shots) await couple.screenshot({ path: `${shots}/rishta-host.png`, fullPage: true });

  // a photo address with no session is "not found"
  const anon = await phonePage(browser);
  const res = await anon.request.get(`/rishta/photo/00000000-0000-4000-8000-000000000000/0`);
  expect(res.status()).toBe(404);

  // she deletes hers: gone at once, for him too
  await go(a, a.url().split("?")[0]);
  await a.getByRole("button", { name: "Delete my profile" }).click();
  await a.getByRole("button", { name: "Yes, delete everything" }).click();
  await expect(a.getByText("Your profile is deleted")).toBeVisible();
  await go(r, `${r.url().split("?")[0]}?tab=matches`);
  await expect(r.getByText("No matches yet.")).toBeVisible();

  // switch it off again so other tests see the RSVP page as before
  await go(admin, `/couple/rishta?wedding=${wid}`);
  await admin.getByRole("button", { name: "Switch off" }).click();
  await expect(admin.getByRole("button", { name: "Switch on" })).toBeVisible();
});
