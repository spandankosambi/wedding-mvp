import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import * as XLSX from "xlsx";

/* The guest list's Hotel and Room No. columns, its download and re-upload,
   the left panel's icons, and the "Need help?" form. Uses the first demo
   wedding (Ananya & Arjun). */

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

test("Guests view: Hotel and Room No. for households shown Travel & Stay", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "couple@example.com");
  await page.goto("/committee?family=groom&view=guests");
  await expect(page.getByRole("columnheader", { name: "Hotel", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Room No.", exact: true })).toBeVisible();

  // a guest whose household is shown Travel & Stay: a hotel picked from the site's list, and a room typed in
  const row = page.locator("tbody tr").filter({ has: page.locator("input[aria-label^='Show Travel & Stay']:checked") }).first();
  const name = (await row.locator("td").nth(1).locator("p").first().textContent())!.trim();
  const hotel = row.getByLabel(`Hotel for ${name}`);
  await expect(hotel.locator("option")).toContainText(["Choose…", "Taj Lands End, Bandra", "Grand Hyatt, Santacruz"]);
  await hotel.selectOption("Grand Hyatt, Santacruz");
  await row.getByLabel(`Room No. for ${name}`).fill("1207");
  await row.getByLabel(`Room No. for ${name}`).press("Enter");
  await page.waitForTimeout(800);
  await page.reload();
  const again = page.locator("tbody tr").filter({ hasText: name }).first();
  await expect(again.getByLabel(`Hotel for ${name}`)).toHaveValue("Grand Hyatt, Santacruz");
  await expect(again.getByLabel(`Room No. for ${name}`)).toHaveValue("1207");

  // a household not shown Travel & Stay has no hotel or room to fill
  const off = page.locator("tbody tr").filter({ has: page.locator("input[aria-label^='Show Travel & Stay']:not(:checked)") }).first();
  if (await off.count()) await expect(off.getByLabel(/^Hotel for/)).toHaveCount(0);
});

test("download the guest list, edit it, upload it: only the change is applied", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "couple@example.com");
  await page.goto("/committee?family=bride");

  // the CSV opens in a spreadsheet as-is
  const csv = await page.request.get("/committee/export?family=bride&format=csv");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain("Guest ID (keep)");

  // the Excel file: a sheet of guests and a sheet of instructions
  const res = await page.request.get("/committee/export?family=bride&format=xlsx");
  expect(res.status()).toBe(200);
  const wb = XLSX.read(await res.body(), { type: "buffer" });
  expect(wb.SheetNames).toEqual(["Guest list", "How to update"]);
  const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Guest list"], { header: 1, defval: "" });
  const h = rows[0];
  expect(rows.length).toBeGreaterThan(2);
  expect(rows[1][h.indexOf("Family")]).toBe("Ananya's family");

  // change one guest's relation-free field: their name gets a middle initial
  const nameCol = h.indexOf("Guest name");
  const before = rows[1][nameCol];
  rows[1][nameCol] = `${before} K.`;
  const out = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet(rows), "Guest list");
  const file = XLSX.write(out, { type: "buffer", bookType: "xlsx" }) as Buffer;

  await page.getByRole("button", { name: "Update from spreadsheet" }).click();
  await page.getByLabel("Spreadsheet to upload").setInputFiles({ name: "guests.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: file });
  await page.getByRole("button", { name: "Check changes" }).click();
  const plan = page.getByTestId("sheet-plan");
  await expect(plan).toContainText("Changes · 1");
  await expect(plan).toContainText(`name "${before}" → "${before} K."`);
  await page.getByRole("button", { name: "Apply 1 change" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved 1 change" })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await page.goto("/committee?family=bride&view=guests");
  await expect(page.getByText(`${before} K.`, { exact: true })).toBeVisible();

  // put it back the same way
  rows[1][nameCol] = before;
  const back = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(back, XLSX.utils.aoa_to_sheet(rows), "Guest list");
  await page.goto("/committee?family=bride");
  await page.getByRole("button", { name: "Update from spreadsheet" }).click();
  await page.getByLabel("Spreadsheet to upload").setInputFiles({ name: "guests.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: XLSX.write(back, { type: "buffer", bookType: "xlsx" }) as Buffer });
  await page.getByRole("button", { name: "Check changes" }).click();
  await page.getByRole("button", { name: "Apply 1 change" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved 1 change" })).toBeVisible();
});

test("left panel: icons on each section and a help form at the foot", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "couple@example.com");
  await page.goto("/couple/site?family=bride");
  const jump = page.getByRole("navigation", { name: "Jump to" }).first();
  await expect(jump.locator(".portal-jump-icon")).toHaveCount(await jump.getByRole("link").count());
  // Need help? sits at the bottom of the column, below the list; About us is gone
  await expect(page.getByText("About us")).toHaveCount(0);
  const listBox = (await jump.boundingBox())!;
  const about = (await page.getByRole("region", { name: "Need help?" }).boundingBox())!;
  expect(about.y).toBeGreaterThan(listBox.y + listBox.height);
  expect(about.y + about.height).toBeGreaterThan(900 * 0.75);

  // Need help? is a short form that reaches our inbox
  await page.getByRole("button", { name: "Ask us anything →" }).click();
  const dialog = page.getByRole("dialog", { name: "Write to us" });
  await dialog.getByLabel("Your name").fill("Ananya");
  await dialog.getByLabel("What is it about?").selectOption("Something isn't working");
  await dialog.getByLabel("Your message").fill("The print preview looks blank on my phone.");
  await dialog.getByRole("button", { name: "Send message" }).click();
  await expect(dialog.getByRole("status")).toContainText("your message is on its way");
  const mail = fs.readFileSync("var/outbox/mail.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l)).reverse()
    .find((m) => /^Help request/.test(m.subject));
  expect(mail.subject).toBe("Help request: Something isn't working — Ananya");
  expect(mail.html).toContain("The print preview looks blank on my phone.");
  expect(mail.html).toContain("couple@example.com");
});
