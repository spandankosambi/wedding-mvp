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

test("the couple downloads printable invitation cards after a few questions", async ({ page }) => {
  await signIn(page, "couple@example.com");
  await page.goto("/couple");
  await page.getByRole("button", { name: "Print invitation cards" }).click();
  const dialog = page.getByRole("dialog", { name: "Download invitation PDF to print" });
  await expect(dialog).toBeVisible();

  await dialog.getByText("Groom's family", { exact: true }).click();
  await dialog.getByRole("combobox", { name: "Card size" }).selectOption("a5");
  await dialog.getByText("A separate card for each event", { exact: true }).click();
  await dialog.getByPlaceholder("|| Shree Ganeshaya Namah ||").fill("|| Shree Ganeshaya Namah ||");
  await dialog.getByPlaceholder("Mr. & Mrs. Rajesh Kosambi").fill("Mr. & Mrs. Vikram Kapoor");
  // the groom's card lists every common event; one left out
  await dialog.getByRole("button", { name: "Haldi" }).click();
  await expect(dialog.getByTestId("print-summary")).toContainText("6 pages · card 148 × 210 mm (154 × 216 mm with bleed)");
  if (shots) await page.screenshot({ path: `${shots}/print-dialog.png`, fullPage: true });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: "Download PDF" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("invitation-groom-a5-with-event-cards.pdf");
  const file = await download.path();
  const pdf = fs.readFileSync(file!).toString("latin1");
  expect(pdf.startsWith("%PDF")).toBe(true);
  expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(6);
  if (shots) fs.copyFileSync(file!, `${shots}/downloaded.pdf`);
  await expect(dialog.getByRole("status")).toContainText("Downloaded invitation-groom-a5-with-event-cards.pdf");

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
