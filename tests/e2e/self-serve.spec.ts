import { test, expect } from "@playwright/test";
import fs from "node:fs";

/** Latest magic link written to the outbox for this address. */
function signInUrl(email: string): string {
  const lines = fs.readFileSync("var/outbox/mail.jsonl", "utf8").trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = JSON.parse(lines[i]);
    if (m.to === email && m.signInUrl) return m.signInUrl;
  }
  throw new Error(`no sign-in link for ${email}`);
}

test("a couple signs up, edits their site, and a guest RSVPs from the shared link", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;

  // ── sign up ────────────────────────────────────────────────
  await page.goto("/start");
  await page.fill("input[name=brideName]", "Sanya");
  await page.fill("input[name=groomName]", "Kabir");
  await page.locator("label:has(input[name=you][value=bride])").click();
  await page.fill("input[name=weddingDate]", "2027-04-18");
  await page.fill("input[name=city]", "Udaipur");
  await page.fill("input[name=email]", email);
  await page.click("button[type=submit]");
  await expect(page.getByText(/check your inbox/i)).toBeVisible();

  // ── magic link lands in the editor ─────────────────────────
  await page.goto(signInUrl(email));
  await expect(page).toHaveURL(/\/couple\/site/);
  // (the bride's family's section, to start)
  await expect(page.getByRole("heading", { name: /edit Sanya's family's site/i })).toBeVisible();
  // a new wedding starts with only the wedding day…
  await expect(page.getByText("1 event", { exact: true })).toBeVisible();
  // …and the couple adds the rest of the week from the picker
  await page.getByRole("button", { name: "+ Haldi" }).click();
  await expect(page).toHaveURL(/saved=event-/);
  await page.getByRole("button", { name: "+ Mehendi" }).click();
  await expect(page.getByText("3 events", { exact: true })).toBeVisible();

  // ── hide one event from the public site ────────────────────
  const haldi = page.locator("details", { has: page.locator("input[name=name][value=Haldi]") });
  await haldi.locator("summary").click();
  await haldi.getByRole("button", { name: /hide from site/i }).click();
  await expect(page.getByText(/1 hidden/)).toBeVisible();

  // ── the public site reflects it ────────────────────────────
  // the family's link carries a code; the plain address shows only names and date
  await page.goto("/couple/bride");
  const link = new URL(await page.locator("#share input[readonly]").inputValue());
  expect(link.pathname + link.search).toMatch(/^\/w\/sanya-weds-kabir\?side=bride&k=[a-z2-9]{8}$/);
  await page.goto("/w/sanya-weds-kabir");
  await expect(page.getByTestId("private-invitation")).toBeVisible();
  await page.goto(link.pathname + link.search);
  await expect(page.getByRole("heading", { name: "Mehendi" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Haldi" })).toHaveCount(0);
  // replies from people who are not on the guest list are off until the family allows them
  await expect(page.getByRole("link", { name: /Confirm your attendance/ })).toHaveCount(0);
  await page.goto("/couple/bride");
  await page.locator("#rsvp input[name=rsvpOpen]").check();
  await page.getByTestId("floating-save").click();
  await expect(page).toHaveURL(/\/couple\/bride\?saved=rsvp/);

  // ── a guest RSVPs from the shared link, no account ─────────
  await page.goto(link.pathname + link.search);
  const replyHref = await page.getByRole("link", { name: /Confirm your attendance/ }).getAttribute("href");
  expect(replyHref).toMatch(/^\/w\/sanya-weds-kabir\/rsvp\?side=bride&k=/);
  await page.goto(replyHref!);
  await page.fill("input[placeholder='The Mehtas / Priya Nair']", "The Kapoors");
  await page.fill("input[inputmode=tel]", "+91 98765 43210");
  const cards = page.getByTestId("event-card");
  await cards.nth(0).getByRole("button", { name: /^attending$/i }).click();
  await cards.nth(1).getByRole("button", { name: /can.t make it/i }).click();
  await page.getByRole("button", { name: /send rsvp/i }).click();
  await expect(page.getByText(/see you at the/i)).toBeVisible();

  // the edit link they were handed works and remembers the answers
  const editUrl = await page.locator("input[readonly]").inputValue();
  expect(editUrl).toContain("/rsvp/");
  await page.goto(editUrl);
  await expect(page.getByText(/The Kapoors/i).first()).toBeVisible();

  // ── the dashboard counts them; the bride's section lists them ──
  await page.goto("/couple");
  await expect(page.getByRole("region", { name: "Sanya's family" })).toContainText("Families1");
  await page.getByRole("link", { name: "Open Sanya's section →" }).click();
  await expect(page.getByText(/of 1 families/)).toBeVisible(); // the household is counted here; its name is in the guest list

  // the link the bride's family is told to share must point at the host they are on —
  // an APP_URL left pointing elsewhere would hand 300 guests a dead link
  const shareUrl = await page.locator("#share input[readonly]").inputValue();
  expect(shareUrl).toBe(new URL(link.pathname + link.search, page.url()).toString());


  // ── someone else uses the shared link with the Kapoors' number ──
  // the Kapoors stay as they are; the reply waits on the guest list for a look
  await page.goto(replyHref!);
  await page.fill("input[placeholder='The Mehtas / Priya Nair']", "Kapoor cousin");
  await page.fill("input[inputmode=tel]", "098765 43210");
  await page.getByTestId("event-card").nth(1).getByRole("button", { name: /^attending$/i }).click();
  await page.getByRole("button", { name: /send rsvp/i }).click();
  await expect(page.getByText(/see you at the/i)).toBeVisible();
  await expect(page.getByText(/Kapoors/)).toHaveCount(0); // never shown the matched household
  await page.goto("/committee?family=bride");
  await page.setViewportSize({ width: 375, height: 800 });
  await page.getByRole("button", { name: "Needs a look · 1" }).click();
  const notice = page.getByTestId("needs-look");
  await expect(notice).toContainText("Possible match: The Kapoors (same phone).");
  await expect(notice).toContainText("coming to");
  await notice.getByRole("button", { name: "Yes, that's them" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Add this reply to The Kapoors?");
  await confirm.getByRole("button", { name: "Yes, that's them" }).click();
  await expect(page.getByText("Kapoor cousin's reply is now part of The Kapoors")).toBeVisible();
  await expect(page.getByRole("button", { name: /Needs a look/ })).toHaveCount(0);
  await expect(page.getByTestId("needs-look")).toHaveCount(0);
});

test("each family decides whether people who are not on its guest list can reply", async ({ page }) => {
  const email = `e2e-off-${Date.now()}@example.com`;
  await page.goto("/start");
  await page.fill("input[name=brideName]", "Riya");
  await page.fill("input[name=groomName]", "Veer");
  await page.locator("label:has(input[name=you][value=bride])").click();
  await page.fill("input[name=weddingDate]", "2027-06-06");
  await page.fill("input[name=city]", "Goa");
  await page.fill("input[name=email]", email);
  await page.click("button[type=submit]");
  // wait for the server action to finish before reading the outbox it writes
  await expect(page.getByText(/check your inbox/i)).toBeVisible();
  await page.goto(signInUrl(email));

  // the bride's family's RSVP contact, on its site…
  await page.getByLabel("Contact 1 name").fill("Riya's dad");
  await page.getByLabel("Contact 1 number").fill("+91 90000 12345");
  await page.getByTestId("floating-save").click();
  await expect(page).toHaveURL(/saved=wording/);

  // …and its own RSVP settings, in its section
  await page.goto("/couple/bride");
  await expect(page.locator("#rsvp input[name=rsvpOpen]")).not.toBeChecked(); // off unless turned on
  const bride = new URL(await page.locator("#share input[readonly]").inputValue());
  // the groom's family turns its own on
  await page.goto("/couple/groom");
  const groom = new URL(await page.locator("#share input[readonly]").inputValue());
  await page.locator("#rsvp input[name=rsvpOpen]").check();
  await page.getByTestId("floating-save").click();
  await expect(page).toHaveURL(/\/couple\/groom\?saved=rsvp/);

  await page.goto(`/w/riya-weds-veer/rsvp${bride.search}`);
  await expect(page.getByRole("heading", { name: "Replies are by personal invitation" })).toBeVisible();
  // a tap opens WhatsApp with the family
  await expect(page.getByRole("link", { name: /WhatsApp Riya's dad on \+91 90000 12345/ })).toHaveAttribute("href", "https://wa.me/919000012345");
  await expect(page.getByRole("button", { name: /send rsvp/i })).toHaveCount(0);
  // the groom's family still takes replies
  await page.goto(`/w/riya-weds-veer/rsvp${groom.search}`);
  await expect(page.getByRole("heading", { name: "Will you be joining us?" })).toBeVisible();
});
