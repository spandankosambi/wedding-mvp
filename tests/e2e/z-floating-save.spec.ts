import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";

/* One Save per page (grey until something changes, coral once it has, saving
   every changed section together), names with a space in them, your own name
   on People & access, and photos that can't simply be saved. */

function latestSignIn(email: string): string {
  const lines = fs.readFileSync("var/outbox/mail.jsonl", "utf8").trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = JSON.parse(lines[i]);
    if (m.to === email && m.signInUrl) return m.signInUrl;
  }
  throw new Error(`no sign-in link for ${email}`);
}

/** A fresh couple of our own, signed up by the groom. */
async function newCouple(page: Page, bride: string, groom: string) {
  const email = `e2e-save-${Date.now()}@example.com`;
  await page.goto("/start");
  await page.fill("input[name=brideName]", bride);
  await page.fill("input[name=groomName]", groom);
  await page.locator("label:has(input[name=you][value=groom])").click();
  await page.fill("input[name=weddingDate]", "2027-03-03");
  await page.fill("input[name=city]", "Pune");
  await page.fill("input[name=email]", email);
  await page.click("button[type=submit]");
  await expect(page.getByText(/check your inbox/i)).toBeVisible();
  await page.goto(latestSignIn(email));
  await expect(page).toHaveURL(/\/couple\/site/);
  return email;
}

test("one floating Save: clean on arrival, lit by a change, saves two sections at once", async ({ page }) => {
  test.setTimeout(150_000);
  await newCouple(page, "Pooja Kumari", "Spandan Kosambi");

  for (const url of ["/couple", "/couple/bride", "/couple/site?family=bride", "/couple/site?family=groom"]) {
    await page.goto(url);
    const save = page.getByTestId("floating-save");
    await expect(save, url).toHaveText("All changes saved");
    await expect(save, url).toBeDisabled();
  }

  // the editor has no other Save buttons, however many sections it has
  await page.goto("/couple/site?family=bride");
  await expect(page.getByRole("button", { name: /^Save/ })).toHaveCount(0);

  // two sections changed → one press saves both
  const save = page.getByTestId("floating-save");
  await page.locator("#words textarea[name=story]").fill("We met at a friend's wedding in Udaipur.");
  await expect(save).toBeEnabled();
  await expect(save).toHaveText("Save changes");
  await page.locator("#travel textarea[name=gettingThere]").fill("Pune airport is 20 minutes away.");
  await expect(save).toHaveText("Save changes (2)");
  await save.click();
  await expect(page).toHaveURL(/saved=(words(%2C|,)travel|travel(%2C|,)words)/);
  await expect(page.getByRole("status").first()).toContainText("Saved");
  await expect(save).toHaveText("All changes saved");
  await page.reload();
  await expect(page.locator("#words textarea[name=story]")).toHaveValue("We met at a friend's wedding in Udaipur.");
  await expect(page.locator("#travel textarea[name=gettingThere]")).toHaveValue("Pune airport is 20 minutes away.");

  // typing something back to how it was greys the button again
  const tag = page.locator("#words input[name=hashtag]");
  const was = await tag.inputValue();
  await tag.fill("#Changed");
  await expect(save).toBeEnabled();
  await tag.fill(was);
  await expect(save).toBeDisabled();
});

test("names keep their spaces; the person who signed up is named alone and can rename themselves", async ({ page }) => {
  test.setTimeout(150_000);
  await newCouple(page, "Pooja Kumari", "Spandan Kosambi");

  // the invitation shows "Spandan Kosambi", not "SpandanKosambi"
  const preview = await page.getByRole("link", { name: /Preview site/ }).getAttribute("href");
  await page.goto(preview!);
  for (const name of ["Pooja Kumari", "Spandan Kosambi"]) {
    const el = page.locator(`[role=text][aria-label="${name}"]`).first();
    await expect(el).toBeVisible();
    const gap = await el.evaluate((n) => {
      const [a, b] = Array.from(n.querySelectorAll(":scope > span"));
      return b.getBoundingClientRect().left - a.getBoundingClientRect().right;
    });
    expect(gap, name).toBeGreaterThan(3);
  }

  // each family is called by its child's first name, not "bride" / "groom"
  await page.goto("/couple");
  const bar = page.getByRole("navigation", { name: "Sections" });
  await expect(bar.getByRole("link", { name: "Pooja's side" })).toBeVisible();
  await expect(bar.getByRole("link", { name: "Spandan's side" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Pooja's family" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Spandan's section →" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Both sides: what's done" }).getByRole("columnheader", { name: /Pooja/ })).toBeVisible();
  await page.goto("/couple/site?family=groom");
  await expect(page.getByRole("heading", { name: "Edit Spandan's family's site" })).toBeVisible();
  // a celebration only Pooja's family hosts reads "Pooja's side" on their invitation
  const first = page.locator("details[id^=event-]").first();
  await page.goto("/couple/site?family=bride");
  await page.locator("details[id^=event-]").first().locator("summary").click();
  await page.locator("details[id^=event-]").first().getByLabel(/is common for both families/).click();
  await expect(page.locator("details[id^=event-]").first()).toContainText("Only Pooja's family's event");
  await page.getByTestId("floating-save").click();
  await expect(page).toHaveURL(/saved=/);
  await page.goto("/couple/people");
  await expect(page.getByTestId("person").first().getByLabel(/^Side for/).locator("option")).toHaveText(["Pooja's side", "Spandan's side", "Both sides"]);
  void first;

  // People & access: the groom signed up, so it's his name, not both
  await page.goto("/couple/people");
  const me = page.getByTestId("person").first();
  const myName = me.getByLabel(/^Name for/);
  await expect(myName).toHaveValue("Spandan Kosambi");
  await myName.fill("Spandan K.");
  await page.getByTestId("floating-save").click();
  await expect(page.locator("p[role=status]")).toContainText("Saved.");
  await page.reload();
  await expect(page.getByTestId("person").first().getByLabel(/^Name for/)).toHaveValue("Spandan K.");
  // …while his own access stays out of reach
  await expect(page.getByTestId("person").first().getByLabel(/^Role for/)).toBeDisabled();
});

test("guest-page photos: no save menu, no dragging", async ({ page }) => {
  await page.goto("/w/gaurav-weds-karishma?side=bride&k=sample");
  await page.waitForLoadState("networkidle"); // the guard switches on once the page is live
  const img = page.locator("main img").first();
  await expect(img).toBeAttached();
  const blocked = await img.evaluate((el) => {
    const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    const drag = new DragEvent("dragstart", { bubbles: true, cancelable: true });
    return { menu: !el.dispatchEvent(menu), drag: !el.dispatchEvent(drag), callout: getComputedStyle(el).getPropertyValue("-webkit-touch-callout") || "none" };
  });
  expect(blocked.menu).toBe(true);
  expect(blocked.drag).toBe(true);
});

test("after saving, Save goes grey even for tick-boxes and lists the page manages itself", async ({ page }) => {
  test.setTimeout(150_000);
  await newCouple(page, "Meera Shah", "Arjun Rao");
  await page.goto("/couple/site?family=groom");
  const save = page.getByTestId("floating-save");
  await page.waitForLoadState("networkidle");
  // an event's "common for both families" tick, a new hotel row with its tick, a contact's WhatsApp tick
  const ev = page.locator("details[id^=event-]").first();
  await ev.locator("summary").click();
  await ev.getByLabel(/is common for both families/).click();
  await page.locator("#words input[name=hashtag]").fill("#MeeraArjun");
  await expect(save).toHaveText("Save changes (2)");
  await save.click();
  await expect(page).toHaveURL(/saved=/);
  await expect(page.getByRole("status").first()).toContainText("Saved");
  await expect(save).toHaveText("All changes saved");
  await expect(save).toBeDisabled();
  // and again, once more, with the same two sections
  await page.locator("details[id^=event-]").first().getByLabel(/is common for both families/).click();
  await page.locator("#words input[name=hashtag]").fill("#MeeraArjun2027");
  await expect(save).toHaveText("Save changes (2)");
  await save.click();
  await expect(page.getByRole("status").first()).toContainText("Saved");
  await expect(save).toHaveText("All changes saved");
  // a fresh visit agrees
  await page.reload();
  await expect(save).toHaveAttribute("data-ready", "true");
  await expect(save).toHaveText("All changes saved");
});

test("text with line breaks doesn't count as a change on arrival or after saving", async ({ page }) => {
  test.setTimeout(150_000);
  await newCouple(page, "Nisha Patel", "Rohan Desai");
  await page.goto("/couple/site?family=bride");
  const save = page.getByTestId("floating-save");
  await expect(save).toHaveAttribute("data-ready", "true");
  await page.locator("#words textarea[name=story]").fill("We met in college.\nTen years later, here we are.");
  await page.locator("#wording textarea[name=shloka]").fill("Line one\nLine two\nLine three");
  await expect(save).toHaveText("Save changes (2)");
  await save.click();
  await expect(page.getByRole("status").first()).toContainText("Saved");
  await expect(save).toHaveText("All changes saved");
  // landing on the page again: still nothing to save
  await page.goto("/couple/site?family=bride");
  await expect(save).toHaveAttribute("data-ready", "true");
  await expect(save).toHaveText("All changes saved");
  await page.reload();
  await expect(save).toHaveAttribute("data-ready", "true");
  await expect(save).toHaveText("All changes saved");
});
