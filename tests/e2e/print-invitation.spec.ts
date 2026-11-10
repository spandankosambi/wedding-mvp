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

test("setup, wording and design — with the live preview on every page — then download", async ({ page }) => {
  await signIn(page, "couple@example.com");
  // each family prints its own cards, from its section
  await page.goto("/couple/groom");
  await page.getByRole("button", { name: "Print invitation cards" }).click();
  const dialog = page.getByRole("dialog", { name: "Download invitation PDF to print" });
  await expect(dialog).toBeVisible();
  const status = dialog.getByTestId("preview-status");
  const preview = dialog.getByTestId("pdf-preview");

  // ── 1 · setup ──
  await expect(dialog.getByText("Joint card")).toHaveCount(0);
  await expect(dialog.getByText(/family.s card — hosted by their parents/)).toContainText("groom's family's");
  await dialog.getByRole("combobox", { name: "Card size" }).selectOption("a5");
  await dialog.getByText("A separate card for each event", { exact: true }).click();
  await dialog.getByRole("button", { name: "Haldi" }).click(); // leave one out
  await expect(dialog.getByTestId("print-summary")).toContainText("6 pages · card 148 × 210 mm (154 × 216 mm with bleed)");
  // (the first preview also waits for the dev server to build the PDF viewer)
  await expect(status).toHaveText("Up to date", { timeout: 90_000 });
  await expect(preview).toHaveAttribute("data-pages", "6", { timeout: 30_000 });
  await dialog.getByRole("button", { name: "Next: wording →" }).click();

  // ── 2 · wording ──
  await dialog.getByPlaceholder(/Shree Ganeshaya Namah/).fill("॥ श्री गणेशाय नमः ॥");
  await dialog.getByPlaceholder(/वक्रतुण्ड/).fill("वक्रतुण्ड महाकाय सूर्यकोटि समप्रभ");
  // parents' names come from the site
  await expect(dialog.getByText("Kavita & Vikram Mehta")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Change them on the dashboard" })).toHaveAttribute("href", "/couple#details");
  await expect(dialog.getByPlaceholder("Mr. & Mrs. Rajesh Kosambi")).toHaveCount(0);
  // each family has its own RSVP and compliments; the groom's print on this card
  await dialog.getByLabel("Groom's family RSVP contacts").fill("Vikram Mehta +91 98200 11111");
  await dialog.getByLabel("Bride's family RSVP contacts").fill("Rajesh Sharma +91 98200 22222");
  await dialog.getByLabel("Groom's family compliments").fill("Mehta family");
  await expect(dialog.getByText("prints on this card")).toHaveCount(2);
  await expect(status).toHaveText("Up to date", { timeout: 30_000 });
  await expect(preview).toHaveAttribute("data-pages", "6");
  await dialog.getByRole("button", { name: "Next: design →" }).click();

  // ── 3 · design ──
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
  await expect(dialog.getByText("QR code to the wedding website")).toBeVisible();
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
  expect(pdf).toContain("Tiro"); // the Devanagari face is embedded
  if (shots) fs.copyFileSync(file!, `${shots}/downloaded.pdf`);
  await expect(dialog.getByRole("status").last()).toContainText("Downloaded invitation-groom-a5-with-event-cards.pdf");

  // the arch is for portrait cards only
  await dialog.getByRole("button", { name: "1 · Setup" }).click();
  await dialog.getByRole("radio", { name: "landscape" }).click();
  await dialog.getByRole("button", { name: "3 · Design" }).click();
  await expect(dialog.getByText("Arch frame", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText(/The arch frame is for portrait cards/)).toBeVisible();

  // the answers are remembered next time
  await page.reload();
  await page.getByRole("button", { name: "Print invitation cards" }).click();
  await expect(page.getByRole("combobox", { name: "Card size" })).toHaveValue("a5");
  await page.getByRole("button", { name: "2 · Wording" }).click();
  await expect(page.getByLabel("Groom's family RSVP contacts")).toHaveValue("Vikram Mehta +91 98200 11111");

  // a custom size, in inches
  await page.getByRole("button", { name: "1 · Setup" }).click();
  await page.getByRole("combobox", { name: "Card size" }).selectOption("custom");
  await page.getByLabel("Custom width").fill("6");
  await page.getByLabel("Custom height").fill("9");
  await expect(page.getByTestId("print-summary")).toContainText("card 228.6 × 152.4 mm"); // still landscape, as left
  await page.getByRole("radio", { name: "portrait" }).click();
  await expect(page.getByTestId("print-summary")).toContainText("card 152.4 × 228.6 mm");
});

test("only the couple can make the cards", async ({ request }) => {
  const res = await request.post("/couple/invitation", { data: { options: {} }, maxRedirects: 0 });
  expect(res.status()).not.toBe(200);
  expect(res.headers()["content-type"] ?? "").not.toContain("application/pdf");
});
