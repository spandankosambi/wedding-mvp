import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";

/* Plan: the couple's and committees' tasks and meeting notes, on a phone. */

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
const phone = { width: 375, height: 800 };

test("the couple add a task, a meeting, and a follow-up task from the meeting", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize(phone);
  await signIn(page, "couple@example.com");
  await page.getByRole("link", { name: "Plan", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Plan", exact: true })).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "Spaces" });
  await expect(tabs.getByRole("link")).toHaveText([/^Both families/, /^Ananya's family/, /^Arjun's family/]);
  // every family is its child's name on screen
  await expect(page.locator("main .portal-shell")).not.toContainText(/\b(bride|groom)\b/i);

  // an empty list offers the suggestions in Both families, and only while empty
  await expect(page.getByTestId("plan-empty")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add suggested tasks" })).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/plan-empty.png`, fullPage: true });
  const open = async (name: string, space: string) => {
    await tabs.getByRole("link", { name }).click();
    await expect(page).toHaveURL(new RegExp(`space=${space}$`));
    await expect(tabs.getByRole("link", { name })).toHaveAttribute("aria-current", "page");
  };
  await open("Ananya's family", "bride");
  await expect(page.getByTestId("plan-empty")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add suggested tasks" })).toHaveCount(0);

  // a task in Both families, with a date: the full form
  await open("Both families", "both");
  await page.getByRole("link", { name: "Add with an owner and date" }).click();
  await expect(page.getByRole("heading", { name: "New task in Both families" })).toBeVisible();
  await page.getByLabel("What needs doing").fill("Book the venue");
  await page.getByLabel("Due").fill("2026-12-10");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("Task added")).toBeVisible();
  await expect(page.getByTestId("plan-task").filter({ hasText: "Book the venue" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add suggested tasks" })).toHaveCount(0);

  // a meeting in Ananya's family, then a follow-up from it
  await open("Ananya's family", "bride");
  await page.getByRole("link", { name: "Add a meeting" }).click();
  await expect(page.getByText("New meeting in Ananya's family")).toBeVisible();
  await expect(page.getByLabel("With the other family")).toHaveCount(0); // only in Both families
  await page.getByLabel("Title").fill("Caterer tasting");
  await page.getByLabel("Vendor").check();
  await page.getByLabel("Who attended").fill("Mama, Papa, Ravi bhaiya");
  await page.getByLabel("What we decided").fill("Veg menu, 300 plates");
  await page.getByRole("button", { name: "Add meeting" }).click();
  await expect(page.getByText("Meeting added")).toBeVisible();
  await expect(page.getByText("What we decided", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Veg menu, 300 plates").first()).toBeVisible();
  const follow = page.getByRole("form", { name: "Add follow-up task" });
  await follow.getByLabel("Follow-up task").fill("Send the final menu to the caterer");
  await follow.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("link", { name: "Send the final menu to the caterer" })).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/plan-meeting.png`, fullPage: true });

  // on the family's list, linked to the meeting; Both families doesn't show it
  await page.getByRole("link", { name: "Ananya's family", exact: true }).click();
  await expect(page.getByTestId("plan-task").filter({ hasText: "Send the final menu" })).toContainText("From Caterer tasting");
  await expect(page.getByRole("region", { name: "Meetings" }).getByRole("link", { name: /Caterer tasting/ })).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/plan-space.png`, fullPage: true });
  await open("Both families", "both");
  // the venue task, nothing from Ananya's family
  await expect(page.getByTestId("plan-task")).toHaveText([/Book the venue/]);
  // the add box: type and press Enter
  await page.getByLabel("New task").fill("Book the pandit");
  await page.getByLabel("New task").press("Enter");
  await expect(page.getByTestId("plan-task").filter({ hasText: "Book the pandit" })).toBeVisible();
  await expect(page.getByLabel("New task")).toHaveValue("");
  await expect(page.getByText("0 of 2 done")).toBeVisible();
  if (shots) {
    await page.screenshot({ path: `${shots}/plan-both-phone.png`, fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: `${shots}/plan-both-desktop.png` });
    await page.goto(page.url().replace("space=both", "space=bride"));
    await page.screenshot({ path: `${shots}/plan-family-desktop.png` });
    await page.getByRole("region", { name: "Meetings" }).getByRole("link", { name: /Caterer tasting/ }).click();
    await expect(page.getByText("What we decided").first()).toBeVisible();
    await page.screenshot({ path: `${shots}/plan-meeting-desktop.png`, fullPage: true });
    await page.goto(page.url().split("?")[0] + "?space=both");
    await page.setViewportSize(phone);
  }
  await expect(page.getByRole("region", { name: "Meetings" }).getByRole("listitem")).toHaveCount(0);

  // delete asks first
  await page.getByTestId("plan-task").filter({ hasText: "Book the venue" }).getByRole("link").click();
  await page.getByRole("button", { name: "Delete task" }).click();
  const ask = page.getByRole("alertdialog");
  await expect(ask).toContainText("Delete “Book the venue”?");
  await ask.getByRole("button", { name: "Keep it" }).click();
  await expect(ask).toHaveCount(0);
});

test("a committee member ticks a task done", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize(phone);
  await signIn(page, "committee@example.com");
  await page.goto("/committee/plan");
  await page.getByLabel("New task").fill("Call the mehendi artist");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const row = page.getByTestId("plan-task").filter({ hasText: "Call the mehendi artist" });
  await row.getByRole("checkbox").click();
  await expect(page.getByText(/^Done \d+$/)).toBeVisible();
  await page.reload();
  await page.getByText(/^Done \d+$/).click();
  await expect(page.getByTestId("plan-task").filter({ hasText: "Call the mehendi artist" }).getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
});

test("the other family's helper gets 'not found' for a family's space and its meeting", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const helper = `plan-helper-${Date.now()}@example.com`;
  await signIn(page, "couple@example.com");
  // a meeting in Ananya's family
  await page.goto("/couple/plan?space=bride&meeting=new");
  await page.getByLabel("Title").fill("Private family talk");
  await page.getByRole("button", { name: "Add meeting" }).click();
  await expect(page.getByText("Meeting added")).toBeVisible();
  const meetingId = new URL(page.url()).searchParams.get("meeting")!;
  // a helper who works Arjun's side only
  await page.goto("/couple/people");
  const add = page.locator("#add");
  await add.getByLabel("Name").fill("Arjun's cousin");
  await add.getByLabel("Email").fill(helper);
  await add.getByLabel("Side for the new person").selectOption("groom");
  await add.getByRole("button", { name: "Add" }).click();
  await expect(page.locator("p[role=status]")).toContainText(`We emailed ${helper}`);

  const ctx = await browser.newContext({ viewport: phone });
  const theirs = await ctx.newPage();
  await signIn(theirs, helper);
  await theirs.getByRole("link", { name: "Plan", exact: true }).click();
  await expect(theirs).toHaveURL(/\/committee\/plan/);
  await expect(theirs.getByRole("navigation", { name: "Spaces" }).getByRole("link")).toHaveText([/^Both families/, /^Arjun's family/]);
  for (const url of ["/committee/plan?space=bride", `/committee/plan?meeting=${meetingId}`, `/couple/plan?meeting=${meetingId}`]) {
    await theirs.goto(url);
    await expect(theirs.getByText("Private family talk")).toHaveCount(0);
    await expect(theirs.getByRole("heading", { name: /couldn.t find/i })).toBeVisible();
  }
  await ctx.close();
});

test("someone not signed in (a guest) can't open either Plan page", async ({ page }) => {
  for (const url of ["/couple/plan", "/committee/plan"]) {
    await page.goto(url);
    await expect(page).toHaveURL(/\/signin/);
  }
});
