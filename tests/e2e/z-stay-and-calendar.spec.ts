import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import * as XLSX from "xlsx";

/* After saying yes: a calendar file to download and one emailed. On the guest
   list: a blank template to fill in and upload, the Hotels & rooms view, and
   stay details sent to a household. Uses the first demo wedding. */

const mails = () => fs.readFileSync("var/outbox/mail.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));

async function signIn(page: Page, email: string) {
  await page.goto("/signin");
  await page.fill("input[name=email]", email);
  await page.click("button[type=submit]");
  await expect(page.getByText(/on its way/i)).toBeVisible();
  const m = mails().reverse().find((x) => x.to === email && x.signInUrl);
  await page.goto(m.signInUrl);
}

test("attending: add to calendar, by download, Google link and email", async ({ page }) => {
  test.setTimeout(90_000);
  const url = fs.readFileSync("var/e2e-seed.txt", "utf8").split("\n").find((l) => l.startsWith("The Guptas:"))!.split(": ")[1].trim();
  const token = url.split("/rsvp/")[1];
  await page.goto(url);
  const cards = page.getByTestId("event-card");
  await cards.nth(0).getByRole("button", { name: /attending/i }).click();
  await page.getByRole("button", { name: /send rsvp/i }).click();

  const cal = page.getByTestId("add-to-calendar");
  await expect(cal).toBeVisible();
  await expect(page.getByTestId("calendar-emailed")).toContainText("gu•••@example.com");
  await expect(cal.getByRole("link", { name: "Add to Google Calendar" }).first()).toHaveAttribute("href", /calendar\.google\.com/);
  await expect(cal.getByRole("link", { name: /Download calendar file/ })).toHaveAttribute("href", `/rsvp/${token}/calendar`);

  const ics = await page.request.get(`/rsvp/${token}/calendar`);
  expect(ics.status()).toBe(200);
  expect(ics.headers()["content-type"]).toContain("text/calendar");
  const body = await ics.text();
  expect(body).toContain("BEGIN:VEVENT");
  expect(body.match(/BEGIN:VEVENT/g)).toHaveLength(1);

  // an invitation (Yes / Maybe / No in their mail app), with the guest invited
  const sent = mails().reverse().find((m) => m.to === "gupta@example.com" && m.ics);
  expect(sent.subject).toMatch(/^Invitation: /);
  expect(sent.ics).toContain("METHOD:REQUEST");
  expect(sent.ics.replace(/\r\n /g, "")).toContain("mailto:gupta@example.com");
  // three hours unless the couple set another length
  expect(body).toMatch(/DTSTART:(\d{8}T\d{6}Z)[\s\S]*DTEND:/);

  // changing their mind about that celebration cancels it on their calendar
  await page.goto(url);
  await page.getByTestId("event-card").nth(0).getByRole("button", { name: /can.t make it|declin|regret/i }).click();
  await page.getByRole("button", { name: /send rsvp|update rsvp/i }).click();
  await expect(page.getByText(/saved/i).first()).toBeVisible();
  const cancel = mails().reverse().find((m) => m.to === "gupta@example.com" && m.ics);
  expect(cancel.subject).toMatch(/^Cancelled: /);
  expect(cancel.ics).toContain("METHOD:CANCEL");

  // a link that isn't theirs gets nothing
  expect((await page.request.get(`/rsvp/not-a-real-token-1234567890/calendar`)).status()).toBe(404);
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/rsvp-calendar.png`, fullPage: true });
});

test("blank template: download, fill in, upload in Import, guest added", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "couple@example.com");
  await page.goto("/committee/import?family=bride");
  await page.getByRole("button", { name: /Upload a spreadsheet/ }).click();
  const box = page.getByTestId("template-box");
  await expect(box).toBeVisible();
  const href = await box.getByRole("link", { name: "Template (Excel)" }).getAttribute("href");

  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  const wb = XLSX.read(await res.body(), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Guest list"], { header: 1, defval: "" });
  const h = rows[0];
  expect(h).toContain("Guest name");
  expect(rows.filter((r, i) => i > 0 && r.some(Boolean))).toHaveLength(0); // headers only

  const row = h.map(() => "");
  row[h.indexOf("Household")] = "The Templetons";
  row[h.indexOf("Guest name")] = "Tara Templeton";
  row[h.indexOf("Phone / WhatsApp")] = "9876500011";
  const out = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet([h, row]), "Guest list");
  await page.getByTestId("file-input").setInputFiles({ name: "template.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: XLSX.write(out, { type: "buffer", bookType: "xlsx" }) as Buffer });
  await page.getByRole("button", { name: "Read this sheet →" }).click();

  const review = page.getByTestId("template-review");
  await expect(review).toBeVisible();
  await expect(review).toContainText("Tara Templeton");
  await review.getByRole("button", { name: /^Add \d+ change/ }).click();
  await expect(review.getByRole("status")).toContainText("Nobody was added twice");
  await page.goto("/committee?family=bride&view=guests");
  await expect(page.getByText("Tara Templeton", { exact: true })).toBeVisible();
});

test("Hotels & rooms view, and stay details emailed to a household", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "couple@example.com");

  // put one guest in a room first
  await page.goto("/committee?family=groom&view=guests");
  const row = page.locator("tbody tr").filter({ has: page.locator("input[aria-label^='Show Travel & Stay']:checked") }).first();
  const name = (await row.locator("td").nth(1).locator("p").first().textContent())!.trim();
  await row.getByLabel(`Hotel for ${name}`).selectOption("Taj Lands End, Bandra");
  await row.getByLabel(`Room No. for ${name}`).fill("808");
  await page.getByTestId("floating-save").click();
  await expect(page.getByTestId("floating-save")).toHaveText("All changes saved");

  await page.getByRole("link", { name: "Hotels & rooms" }).click();
  await expect(page).toHaveURL(/view=stay/);
  const taj = page.getByRole("region", { name: "Taj Lands End, Bandra" });
  await expect(taj).toBeVisible();
  await expect(taj.getByRole("row").filter({ hasText: "Room 808" })).toContainText(name);
  await expect(page.getByRole("region", { name: "Grand Hyatt, Santacruz" })).toBeVisible();
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/stay-view.png`, fullPage: true });

  // that guest's household: Email sends hotel, room and map to the primary contact
  const household = page.getByTestId("stay-household").filter({ hasText: "Taj Lands End" }).filter({ hasText: "808" }).first();
  await household.getByRole("button", { name: /^Email stay details/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Stay details emailed to" })).toBeVisible();
  const sent = mails().reverse().find((m) => m.stay);
  expect(sent.subject).toContain("where you're staying");
  expect(sent.html).toContain("Taj Lands End, Bandra");
  expect(sent.html).toContain("Room 808");
  // and the household shows it was sent
  await expect(household.getByTestId("stay-sent")).toContainText("✓ Emailed");
  await page.reload();
  await expect(page.getByTestId("stay-household").filter({ hasText: "808" }).first().getByTestId("stay-sent")).toContainText("✓ Emailed");
});

test("switching family keeps each editor's own fields; Add here lands in Travel & Stay; event duration", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "couple@example.com");

  // what the groom's family's editor holds on a fresh visit
  await page.goto("/couple/site?family=groom");
  const groomStory = await page.locator("#words textarea[name=story]").inputValue();
  const groomTag = await page.locator("#words input[name=hashtag]").inputValue();

  // from the bride's editor, the family's name in the bar leads to its Overview…
  await page.goto("/couple/site?family=bride");
  await page.locator("#words textarea[name=story]").fill("Only the bride's family's story.");
  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Arjun's side" }).click();
  // (leaving with an unsaved change asks first)
  page.once("dialog", (d) => d.accept());
  await expect(page).toHaveURL(/\/couple\/groom$/);
  // …and its editor shows its own fields, with nothing to save
  await page.getByRole("navigation", { name: "Arjun's side pages" }).getByRole("link", { name: "Edit your site" }).click();
  await expect(page).toHaveURL(/\/couple\/site\?family=groom/);
  await expect(page.getByTestId("floating-save")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("#words textarea[name=story]")).toHaveValue(groomStory);
  await expect(page.locator("#words input[name=hashtag]")).toHaveValue(groomTag);
  await expect(page.getByTestId("floating-save")).toHaveText("All changes saved");

  // "Add here" from the guest list: Travel & Stay on screen, cursor in a hotel name
  await page.goto("/couple/site?family=groom&focus=hotel#travel");
  await expect.poll(() => page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.name ?? "")).toMatch(/^stay\d+name$/);
  const top = await page.locator("#travel").evaluate((el) => el.getBoundingClientRect().top);
  expect(top).toBeGreaterThanOrEqual(0);
  expect(top).toBeLessThan(300);

  // each celebration has a duration, 3 hours unless changed
  await page.goto("/couple/site?family=groom");
  const ev = page.locator("details[id^=event-]").first();
  await ev.locator("summary").click();
  const dur = ev.getByLabel(/^Duration in hours for/);
  await expect(dur).toHaveValue("3");
  await dur.fill("2.5");
  await page.getByTestId("floating-save").click();
  await expect(page).toHaveURL(/saved=/);
  await page.reload();
  await page.locator("details[id^=event-]").first().locator("summary").click();
  await expect(page.locator("details[id^=event-]").first().getByLabel(/^Duration in hours for/)).toHaveValue("2.5");
});
