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

test("without the link's code a stranger sees only names and the date", async ({ page }) => {
  for (const url of ["/w/gaurav-weds-karishma", "/w/gaurav-weds-karishma?side=groom", "/w/gaurav-weds-karishma?side=groom&k=wrong", "/w/gaurav-weds-karishma/rsvp?side=groom", "/w/gaurav-weds-karishma?invite=not-a-real-code"]) {
    await page.goto(url);
    const gate = page.getByTestId("private-invitation");
    await expect(gate, url).toBeVisible();
    await expect(gate).toContainText("A private invitation");
    await expect(gate).toContainText(/Karishma|Gaurav/);
    // no venues, no phone numbers, no way to reply
    await expect(page.getByRole("link", { name: /Confirm your attendance/ })).toHaveCount(0);
    await expect(page.locator("a[href^='tel:'], a[href*='wa.me']")).toHaveCount(0);
    await expect(page.getByText("Sangeet")).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  }
  // with the code: the whole invitation, and the code travels on to the reply form
  await page.goto("/w/gaurav-weds-karishma?side=groom&k=sample");
  await expect(page.getByTestId("private-invitation")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Sangeet", level: 3 })).toBeVisible();
  await expect(page.getByRole("link", { name: /Confirm your attendance/ })).toHaveAttribute("href", "/w/gaurav-weds-karishma/rsvp?side=groom&k=sample");
});

test("replies from the shared link are off unless the family turns them on; a new link shuts the old one", async ({ page }) => {
  await signIn(page, "couple2@example.com");
  await page.goto("/couple/bride");
  const share = page.locator("#share");
  const url = await share.locator("input[readonly]").inputValue();
  expect(url).toMatch(/\/w\/gaurav-weds-karishma\?side=bride&k=sample$/);
  // off: guests with the link see the invitation but no reply button
  const open = page.getByRole("checkbox", { name: /Accept replies from people who are not on the guest list/ });
  await open.uncheck();
  await page.locator("#rsvp").getByRole("button", { name: "Save" }).click();
  await expect(page.locator("p[role=status]")).toContainText("Saved");
  await expect(share.getByRole("link", { name: /Open RSVP form/ })).toHaveCount(0);
  await page.goto(url);
  await expect(page.locator("#rsvp")).toContainText("Replies are by personal invitation");
  await expect(page.getByRole("link", { name: /Confirm your attendance/ })).toHaveCount(0);
  await page.goto("/w/gaurav-weds-karishma/rsvp?side=bride&k=sample");
  await expect(page.getByRole("heading", { name: "Replies are by personal invitation" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Send RSVP|RSVP/ })).toHaveCount(0);

  // a new link: the old one (and its QR) shows only names and date
  await page.goto("/couple/bride");
  await page.locator("#share").getByRole("button", { name: "Get a new link" }).click();
  await expect(page.locator("p[role=status]")).toContainText("Saved");
  const fresh = await page.locator("#share input[readonly]").inputValue();
  expect(fresh).not.toBe(url);
  expect(fresh).toMatch(/&k=[a-z2-9]{8}$/);
  await page.goto(url);
  await expect(page.getByTestId("private-invitation")).toBeVisible();
  await page.goto(fresh);
  await expect(page.getByTestId("private-invitation")).toHaveCount(0);
  // the groom's link is its own and still works
  await page.goto("/w/gaurav-weds-karishma?side=groom&k=sample");
  await expect(page.getByTestId("private-invitation")).toHaveCount(0);
});

test("links on the site's first address lead to the same page on onetapinvites.com", async ({ request }) => {
  for (const path of ["/w/pooja-weds-spandan?side=groom", "/rsvp/some-token", "/"]) {
    const res = await request.get(path, { headers: { "x-forwarded-host": "wedding-mvp-uat.vercel.app" }, maxRedirects: 0 });
    expect(res.status(), path).toBe(308);
    expect(res.headers()["location"]).toBe(`https://onetapinvites.com${path}`);
  }
  // any other address is served as usual
  expect((await request.get("/", { maxRedirects: 0 })).status()).toBe(200);
});
