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
const shots = process.env.SHOTS_DIR;

test("the wording is typed once in Edit your site — the website opens with it, the cards print it", async ({ page }) => {
  await signIn(page, "couple@example.com");
  await page.goto("/couple/site?family=groom");
  const wording = page.locator("#wording");
  await wording.getByLabel(/Invocation at the top/).fill("॥ श्री गणेशाय नमः ॥");
  await wording.getByLabel(/Blessing or shloka/).fill("वक्रतुण्ड महाकाय सूर्यकोटि समप्रभ\nनिर्विघ्नं कुरु मे देव सर्वकार्येषु सर्वदा");
  // two RSVP contacts at most: a WhatsApp number and one to call
  await wording.getByLabel("Contact 1 name").fill("Vikram Mehta");
  await wording.getByLabel("Contact 1 number").fill("+91 98200 11111");
  await wording.getByRole("button", { name: "+ Add another contact" }).click();
  await expect(wording.getByRole("button", { name: "+ Add another contact" })).toHaveCount(0);
  await wording.getByLabel("Contact 2 name").fill("Kavita Mehta");
  await wording.getByLabel("Contact 2 number").fill("98200 33333");
  await wording.getByLabel("Kavita Mehta's number is on WhatsApp").uncheck();
  await wording.getByLabel(/With best compliments from/).fill("Mehta family\nand friends");
  await wording.getByLabel(/Closing line/).fill("Your blessings are our gifts");
  await wording.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/saved=wording/);

  // the groom's website opens the way his family's card does
  await page.goto("/w/ananya-weds-arjun?side=groom");
  await expect(page.getByTestId("invocation")).toHaveText("॥ श्री गणेशाय नमः ॥");
  await expect(page.getByTestId("shloka")).toContainText("निर्विघ्नं कुरु मे देव");
  const hosts = page.getByTestId("hosts");
  await expect(hosts).toContainText("Kavita & Vikram Mehta");
  await expect(hosts).toContainText("at the wedding of their son");
  await expect(page.locator("h1").first()).toHaveText(/Arjun\s*with\s*Ananya/);
  await expect(page.getByText("daughter of Sunita & Rajesh Sharma")).toBeVisible();
  const contacts = page.getByTestId("rsvp-contacts");
  await expect(contacts.getByRole("link", { name: "WhatsApp Vikram Mehta on +91 98200 11111" })).toHaveAttribute("href", "https://wa.me/919820011111");
  await expect(contacts.getByRole("link", { name: "Call Kavita Mehta on 98200 33333" })).toHaveAttribute("href", "tel:+919820033333");
  await expect(page.getByTestId("closing")).toContainText("Your blessings are our gifts");
  await expect(page.getByTestId("closing")).toContainText("With best compliments from");
  if (shots) await page.screenshot({ path: `${shots}/site-wording.png` });
  // from the invocation to the countdown, all on one screen — laptop and phone
  for (const [width, height] of [[1366, 657], [390, 664], [375, 553]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/w/ananya-weds-arjun?side=groom");
    const top = (await page.getByTestId("invocation").boundingBox())!.y;
    const count = (await page.getByTestId("countdown").boundingBox())!;
    expect(top, `${width}×${height}`).toBeGreaterThanOrEqual(0);
    expect(count.y + count.height, `${width}×${height}`).toBeLessThanOrEqual(height);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  // the bride's site has its own wording (none yet)
  await page.goto("/w/ananya-weds-arjun?side=bride");
  await expect(page.getByTestId("invocation")).toHaveCount(0);
  await expect(page.getByTestId("hosts")).toContainText("at the wedding of their daughter");
});

test("setup and design — with the live preview on every page — then download", async ({ page }) => {
  await signIn(page, "couple@example.com");
  // each family prints its own cards, from its section
  await page.goto("/couple/groom");
  await page.getByRole("button", { name: "Print invitation cards" }).click();
  const dialog = page.getByRole("dialog", { name: "Download invitation PDF to print" });
  await expect(dialog).toBeVisible();
  const status = dialog.getByTestId("preview-status");
  const preview = dialog.getByTestId("pdf-preview");

  // two steps now: the wording comes from the site
  await expect(dialog.getByRole("button", { name: "2 · Design" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Wording/ })).toHaveCount(0);

  // ── 1 · setup ──
  await expect(dialog.getByText(/family.s card — hosted by their parents/)).toContainText("groom's family's");
  const words = dialog.getByTestId("card-wording");
  await expect(words).toContainText("॥ श्री गणेशाय नमः ॥");
  await expect(words).toContainText("Vikram Mehta  +91 98200 11111");
  await expect(words).toContainText("Kavita & Vikram Mehta");
  await expect(words.getByRole("link", { name: "Change it in Edit your site" })).toHaveAttribute("href", "/couple/site?family=groom#wording");
  await dialog.getByRole("combobox", { name: "Card size" }).selectOption("a5");
  await dialog.getByText("A separate card for each event", { exact: true }).click();
  await dialog.getByRole("button", { name: "Haldi" }).click(); // leave one out
  await expect(dialog.getByTestId("print-summary")).toContainText("6 pages · card 148 × 210 mm (154 × 216 mm with bleed)");
  // (the first preview also waits for the dev server to build the PDF viewer)
  await expect(status).toHaveText("Up to date", { timeout: 90_000 });
  await expect(preview).toHaveAttribute("data-pages", "6", { timeout: 30_000 });
  await dialog.getByRole("button", { name: "Next: design →" }).click();

  // ── 2 · design ──
  await dialog.getByText("Arch frame", { exact: true }).click(); // A5 portrait: offered
  await dialog.getByText("Toran across the top").click();
  await dialog.getByText("Add your monogram to the card").click();
  await expect(dialog.getByPlaceholder("A | A")).toBeVisible(); // Arjun's side first
  await dialog.getByRole("radio", { name: "wreath crest" }).click();
  await dialog.getByText("Fill the card", { exact: true }).click();
  await dialog.getByText("Names in script", { exact: true }).click();
  await dialog.getByLabel("Add a photo").setInputFiles({
    name: "us.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
  });
  await expect(dialog.getByRole("img", { name: "Your photo" })).toBeVisible();
  // dress codes sit with the QR code now
  await expect(dialog.getByText("QR code to the wedding website")).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: /Dress codes/ })).toBeChecked();
  await expect(status).toHaveText("Updating…");
  await expect(status).toHaveText("Up to date", { timeout: 30_000 });
  await expect(dialog.getByRole("img", { name: "Page 1 of the invitation" })).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/print-design.png` });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: "Download PDF" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("invitation-groom-a5-with-event-cards.pdf");
  const file = await download.path();
  const pdf = fs.readFileSync(file!).toString("latin1");
  expect(pdf.startsWith("%PDF")).toBe(true);
  expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(6);
  expect(pdf).toContain("Tiro"); // the site's Devanagari invocation is printed
  if (shots) fs.copyFileSync(file!, `${shots}/downloaded.pdf`);
  await expect(dialog.getByRole("status").last()).toContainText("Downloaded invitation-groom-a5-with-event-cards.pdf");

  // the arch is for portrait cards only
  await dialog.getByRole("button", { name: "1 · Setup" }).click();
  await dialog.getByRole("radio", { name: "landscape" }).click();
  await dialog.getByRole("button", { name: "2 · Design" }).click();
  await expect(dialog.getByText("Arch frame", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText(/The arch frame is for portrait cards/)).toBeVisible();

  // the answers are remembered next time
  await page.reload();
  await page.getByRole("button", { name: "Print invitation cards" }).click();
  await expect(page.getByRole("combobox", { name: "Card size" })).toHaveValue("a5");

  // a custom size, in inches
  await page.getByRole("combobox", { name: "Card size" }).selectOption("custom");
  await page.getByLabel("Custom width").fill("6");
  await page.getByLabel("Custom height").fill("9");
  await expect(page.getByTestId("print-summary")).toContainText("card 228.6 × 152.4 mm"); // still landscape, as left
  await page.getByRole("radio", { name: "portrait" }).click();
  await expect(page.getByTestId("print-summary")).toContainText("card 152.4 × 228.6 mm");
});

test("wording typed in the print dialog before is offered to move to the site", async ({ page }) => {
  await signIn(page, "couple2@example.com");
  await page.goto("/couple/bride");
  await page.getByRole("button", { name: "Print invitation cards" }).click();
  await page.getByRole("button", { name: "Next: design →" }).click(); // saves this family's answers
  // what an earlier version of the dialog left on this device
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("print-invitation:") && k.endsWith(":bride"))!;
    const saved = JSON.parse(localStorage.getItem(key)!);
    localStorage.setItem(key, JSON.stringify({ ...saved, invocation: "|| Shree Ganeshaya Namah ||", rsvpBride: "Anil Malhotra +91 98220 12345", rsvpGroom: "not ours" }));
  });
  await page.reload();
  await page.getByRole("button", { name: "Print invitation cards" }).click();
  const banner = page.getByTestId("move-wording");
  await expect(banner).toContainText("Invocation, RSVP contacts");
  await banner.getByRole("button", { name: "Move it to my site" }).click();
  await expect(banner).toHaveCount(0);
  await expect(page.getByTestId("card-wording")).toContainText("Anil Malhotra +91 98220 12345");
  await page.goto("/w/gaurav-weds-karishma?side=bride");
  await expect(page.getByTestId("invocation")).toHaveText("|| Shree Ganeshaya Namah ||");
});

test("only the couple can make the cards", async ({ request }) => {
  const res = await request.post("/couple/invitation", { data: { options: {} }, maxRedirects: 0 });
  expect(res.status()).not.toBe(200);
  expect(res.headers()["content-type"] ?? "").not.toContain("application/pdf");
});
