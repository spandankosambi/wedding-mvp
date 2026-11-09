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

test("the couple answers the questions, designs the card with a live preview, then downloads it", async ({ page }) => {
  await signIn(page, "couple@example.com");
  await page.goto("/couple");
  await page.getByRole("button", { name: "Print invitation cards" }).click();
  const dialog = page.getByRole("dialog", { name: "Download invitation PDF to print" });
  await expect(dialog).toBeVisible();

  // ── page 1: what and how ──
  await dialog.getByText("Groom's family", { exact: true }).click();
  await dialog.getByRole("combobox", { name: "Card size" }).selectOption("a5");
  await dialog.getByText("A separate card for each event", { exact: true }).click();
  await dialog.getByPlaceholder(/Shree Ganeshaya Namah/).fill("॥ श्री गणेशाय नमः ॥");
  await dialog.getByPlaceholder("Mr. & Mrs. Rajesh Kosambi").fill("Mr. & Mrs. Vikram Kapoor");
  // the groom's card lists every common event; one left out
  await dialog.getByRole("button", { name: "Haldi" }).click();
  await expect(dialog.getByTestId("print-summary")).toContainText("6 pages · card 148 × 210 mm (154 × 216 mm with bleed)");
  await dialog.getByRole("button", { name: "Next: design →" }).click();

  // ── page 2: design, with the real PDF previewed ──
  // (the first preview also waits for the dev server to build the PDF viewer)
  await expect(dialog.getByTestId("preview-status")).toHaveText("Up to date", { timeout: 90_000 });
  await expect(dialog.getByTestId("pdf-preview")).toHaveAttribute("data-pages", "6", { timeout: 30_000 });
  await dialog.getByText("Arch frame", { exact: true }).click();
  await dialog.getByText("Toran across the top").click();
  await dialog.getByText("Add your monogram to the card").click();
  await expect(dialog.getByPlaceholder("A | A")).toBeVisible(); // Arjun's side first
  await dialog.getByRole("radio", { name: "wreath crest" }).click();
  await dialog.getByText("Names in script", { exact: true }).click();
  await dialog.getByLabel("Add a photo").setInputFiles({
    name: "us.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
  });
  await expect(dialog.getByRole("img", { name: "Your photo" })).toBeVisible();
  await dialog.getByPlaceholder("पूजा • स्पंदन").fill("अर्जुन • अनन्या");
  await expect(dialog.getByTestId("preview-status")).toHaveText("Updating…");
  await expect(dialog.getByTestId("preview-status")).toHaveText("Up to date", { timeout: 30_000 });
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

  // the answers are remembered next time
  await page.reload();
  await page.getByRole("button", { name: "Print invitation cards" }).click();
  await expect(page.getByRole("combobox", { name: "Card size" })).toHaveValue("a5");
  await expect(page.getByPlaceholder("Mr. & Mrs. Rajesh Kosambi")).toHaveValue("Mr. & Mrs. Vikram Kapoor");

  // a custom size, in inches
  await page.getByRole("combobox", { name: "Card size" }).selectOption("custom");
  await page.getByLabel("Custom width").fill("6");
  await page.getByLabel("Custom height").fill("9");
  await expect(page.getByTestId("print-summary")).toContainText("card 152.4 × 228.6 mm");
});

test("only the couple can make the cards", async ({ request }) => {
  const res = await request.post("/couple/invitation", { data: { options: {} }, maxRedirects: 0 });
  expect(res.status()).not.toBe(200);
  expect(res.headers()["content-type"] ?? "").not.toContain("application/pdf");
});
