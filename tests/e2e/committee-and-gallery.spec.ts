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

test("committee adds a family by name, records their RSVP, then deletes them", async ({ page }) => {
  await signIn(page, "committee@example.com");
  await page.goto("/committee");

  // ── add a family: the guest name box is usable ─────────────
  await page.getByRole("button", { name: "Add family" }).click();
  await page.fill("input[placeholder='Sharma Family']", "The Desais");
  await page.getByLabel("Guest 1 email").fill("desai@example.com");
  const name1 = page.getByLabel("Guest 1 name");
  expect((await name1.boundingBox())!.width).toBeGreaterThan(200);
  await name1.fill("Nikhil Desai");
  await page.getByText("+ add another guest").click();
  await page.getByLabel("Guest 2 name").fill("Asha Desai");
  await page.getByRole("dialog").getByRole("button", { name: "Sangeet" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reception" }).click();
  if (shots) await page.screenshot({ path: `${shots}/add-family.png` });
  await page.getByRole("button", { name: "Save family" }).click();
  const row = page.getByRole("row", { name: /The Desais/ });
  await expect(row).toBeVisible();

  // ── RSVP on their behalf: tick names; someone extra is added by name ──
  await row.getByRole("button", { name: /Record RSVP for The Desais/ }).click();
  const cards = page.getByTestId("committee-rsvp-event");
  await expect(cards).toHaveCount(2);
  await cards.nth(0).getByRole("radio", { name: "Attending", exact: true }).click();
  await expect(cards.nth(0).getByText("2 coming")).toBeVisible();
  await page.getByLabel("New guest's full name").fill("Meera Desai");
  await page.getByRole("button", { name: "+ Add guest" }).click();
  await expect(cards.nth(0).getByText("3 coming")).toBeVisible();
  await cards.nth(0).getByLabel("Asha Desai coming to Sangeet").uncheck();
  await cards.nth(1).getByRole("radio", { name: "Not attending" }).click();
  if (shots) await page.screenshot({ path: `${shots}/rsvp-editor.png`, fullPage: true });
  await page.getByRole("button", { name: "Save RSVP" }).click();
  await expect(page.getByText("RSVP saved for The Desais")).toBeVisible();
  await expect(row.getByText("Sangeet ✓2")).toBeVisible();
  await expect(row.getByText("Reception ✗")).toBeVisible();
  await expect(row.getByRole("cell", { name: "3", exact: true })).toBeVisible(); // Meera joined the family

  // ── the same family in the Guests view, with a custom column ──
  await page.getByRole("link", { name: /^Guests/ }).click();
  await expect(page).toHaveURL(/view=guests/);
  const nikhil = page.getByRole("row", { name: /Nikhil Desai/ });
  await expect(nikhil.getByText("Sangeet ✓")).toBeVisible();
  await expect(page.getByRole("row", { name: /Asha Desai/ }).getByText("Sangeet ✗")).toBeVisible();
  await page.getByRole("button", { name: "+ Add column" }).click();
  await page.getByLabel("New column name").fill("Table no.");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("columnheader", { name: /Table no\./ })).toBeVisible();
  const room = page.getByLabel("Table no. for Nikhil Desai");
  await room.fill("204");
  await room.press("Enter");
  await expect(room).toHaveCSS("opacity", "1"); // save finished
  // per-guest RSVP and multi-select
  await page.getByLabel("Select Asha Desai").check();
  await page.getByLabel("Select Meera Desai").check();
  await page.getByRole("button", { name: "Mark RSVP…" }).click();
  await page.getByRole("dialog").getByRole("radio").first().check();
  if (shots) await page.screenshot({ path: `${shots}/bulk-rsvp.png` });
  await page.getByRole("button", { name: "Mark 2 guests" }).click();
  await expect(page.getByText("RSVP marked for 2 guests")).toBeVisible();
  await expect(page.getByRole("row", { name: /Asha Desai/ }).getByText("Sangeet ✓")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Table no. for Nikhil Desai")).toHaveValue("204");
  if (shots) await page.screenshot({ path: `${shots}/guest-view.png`, fullPage: true });
  await page.getByRole("link", { name: /^Families/ }).click();
  await expect(row.getByText("Sangeet ✓3")).toBeVisible();

  // ── delete the family ──────────────────────────────────────
  await row.getByRole("button", { name: "edit" }).click();
  await page.getByRole("button", { name: "Delete family" }).click();
  if (shots) await page.screenshot({ path: `${shots}/delete-confirm.png` });
  await page.getByRole("button", { name: "Yes, delete family" }).click();
  await expect(page.getByRole("row", { name: /The Desais/ })).toHaveCount(0);
});

test("the couple can switch the gallery off and back on", async ({ page }) => {
  await signIn(page, "couple@example.com");
  await page.goto("/couple/site#gallery");
  const gallery = page.locator("#gallery");
  await expect(gallery.getByText(/decorative illustrations/)).toBeVisible();
  if (shots) { await gallery.scrollIntoViewIfNeeded(); await gallery.screenshot({ path: `${shots}/gallery-editor.png` }); }

  await page.goto("/w/ananya-weds-arjun?k=sample");
  await expect(page.getByRole("heading", { name: "Gallery" })).toBeVisible();

  await page.goto("/couple/site#gallery");
  await gallery.locator("input[name=galleryEnabled]").uncheck();
  await page.getByTestId("floating-save").click();
  await expect(page).toHaveURL(/saved=gallery/);
  await page.goto("/w/ananya-weds-arjun?k=sample");
  await expect(page.getByRole("heading", { name: "Gallery" })).toHaveCount(0);

  await page.goto("/couple/site#gallery");
  await gallery.locator("input[name=galleryEnabled]").check();
  await page.getByTestId("floating-save").click();
  await expect(page).toHaveURL(/saved=gallery/);
  await page.goto("/w/ananya-weds-arjun?k=sample");
  await expect(page.getByRole("heading", { name: "Gallery" })).toBeVisible();
});

test("the couple can get from the guest list back to their dashboard", async ({ page }) => {
  await signIn(page, "couple@example.com");
  await page.goto("/committee?family=groom");
  // no separate "back" line: the bar's page tabs lead back to the family's overview
  await expect(page.getByRole("link", { name: /Back to groom/ })).toHaveCount(0);
  await page.getByRole("navigation", { name: "Arjun's side pages" }).getByRole("link", { name: "Overview" }).click();
  await expect(page).toHaveURL(/\/couple\/groom$/);
  // the bar across the top is the same on every screen, in this family's name order
  const bar = page.getByRole("navigation", { name: "Sections" });
  // no couple's names in the bar: the switch carries them, the logo leads home
  await expect(page.locator(".portal-nav-brand")).toHaveCount(0);
  await expect(bar.getByRole("link", { name: "Arjun's side" })).toHaveAttribute("aria-current", "page");
  // everything sits on one line; the couple's names lead to the dashboard
  expect((await page.locator(".portal-nav").boundingBox())!.height).toBeLessThan(64);
  await page.getByRole("link", { name: "One Tap Invites: your dashboard" }).click();
  await expect(page).toHaveURL(/\/couple$/);
  await expect(page.getByRole("heading", { name: "Your wedding at a glance" })).toBeVisible();
  await bar.getByRole("link", { name: "Ananya's side" }).click();
  await expect(page).toHaveURL(/\/couple\/bride$/);
  // inside a family the same bar carries its pages — no second breadcrumb line
  const pages = page.getByRole("navigation", { name: "Ananya's side pages" });
  await expect(pages.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  await pages.getByRole("link", { name: "Guest list" }).click();
  await expect(page).toHaveURL(/\/committee\?family=bride$/);
  await expect(pages.getByRole("link", { name: "Guest list" })).toHaveAttribute("aria-current", "page");
  await pages.getByRole("link", { name: "Edit your site" }).click();
  await expect(page.getByRole("navigation", { name: "Jump to" }).getByRole("link", { name: "Celebrations" })).toBeVisible();
  await expect(page.locator(".portal-nav")).toHaveCount(1);
  await pages.getByRole("link", { name: "Print cards" }).click();
  await expect(page).toHaveURL(/\/couple\/bride\/print$/, { timeout: 20_000 }); // a heavy page: slow the first time on a dev server
  await expect(page.getByTestId("print-page")).toBeVisible();
  // …and it signs you out
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/signin/);
  await page.goto("/couple");
  await expect(page).not.toHaveURL(/\/couple$/);
});

test("a family can be saved without an email", async ({ page }) => {
  await signIn(page, "committee@example.com");
  await page.goto("/committee");
  await page.getByRole("button", { name: "Add family" }).click();
  await page.fill("input[placeholder='Sharma Family']", "Wadiker Family");
  await page.getByLabel("Guest 1 name").fill("Wadiker masa");
  const save = page.getByRole("button", { name: "Save family" });
  await expect(save).toBeEnabled();
  await save.click();
  const row = page.getByRole("row", { name: /Wadiker Family/ });
  await expect(row.getByText("no contact")).toBeVisible();

  // contact details live on each guest; the primary adult's are the family's
  await row.getByRole("button", { name: "edit" }).click();
  await page.getByText("+ add another guest").click();
  await page.getByLabel("Guest 2 name").fill("Sonu");
  await expect(page.getByLabel("Guest 2 phone")).toHaveCount(0); // contact opens on demand
  await page.getByLabel("Guest 2 contact details").click();
  await expect(page.getByLabel("Guest 2 phone")).toBeVisible();
  await page.getByLabel("Guest 2 is the primary adult").check({ force: true }); // the visible ★ covers the radio
  await page.getByLabel("Guest 2 phone").fill("+91 98765 43210");
  await page.getByText("+ add another guest").click();
  await page.getByLabel("Guest 3 name").fill("Swara");
  await page.getByText("+ add another guest").click();
  await page.getByLabel("Guest 4 name").fill("Sanjay");
  await page.getByLabel("Guest 2 age group").selectOption("child"); // a child can't stay primary…
  await expect(page.getByLabel("Guest 1 is the primary adult")).toBeChecked(); // …it moves to an adult
  await page.getByLabel("Guest 2 age group").selectOption("adult");
  await page.getByLabel("Guest 2 is the primary adult").check({ force: true }); // the visible ★ covers the radio
  if (shots) await page.getByRole("dialog").screenshot({ path: `${shots}/family-primary.png` });
  await page.getByRole("button", { name: "Save family" }).click();
  await expect(row.getByText("Sonu")).toBeVisible();
  await expect(row.getByText("+91 98765 43210")).toBeVisible();

  // WhatsApp goes to the primary adult, with the invitation typed out
  // (answer wa.me locally: the test checks the link we build, not WhatsApp)
  await page.context().route(/wa\.me|whatsapp\.com/, (r) => r.fulfill({ body: "whatsapp" }));
  const [tab] = await Promise.all([
    page.context().waitForEvent("page"),
    row.getByRole("button", { name: /on WhatsApp/ }).click(),
  ]);
  await expect.poll(() => tab.url()).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/);
  const text = decodeURIComponent(new URL(tab.url()).searchParams.get("text") ?? "");
  expect(text).toContain("Namaste Sonu!");
  expect(text).toMatch(/\/w\/[\w-]+\?invite=[\w-]{20,}/); // opens the wedding site first
  await tab.close();
  await expect(row.getByText("invite · WhatsApp")).toBeVisible();
});

test("a guest can be edited from the Guests view", async ({ page }) => {
  await signIn(page, "committee@example.com");
  await page.goto("/committee?view=guests");
  await page.getByRole("button", { name: "Edit Padma Iyer" }).click();
  const name = page.getByLabel(/Guest \d name/).and(page.locator(":focus"));
  await expect(name).toHaveValue("Padma Iyer"); // the cursor lands on her
  await name.fill("Padma K Iyer");
  await page.getByRole("button", { name: "Save family" }).click();
  await expect(page.getByText("Saved Padma Iyer's household")).toBeVisible();
  await expect(page.getByRole("row", { name: /Padma K Iyer/ })).toBeVisible();
  await expect(page).toHaveURL(/view=guests/);
});

test("Travel & Stay is one tick per household, from either view, and follows the invitation", async ({ page }) => {
  await signIn(page, "committee@example.com");
  // automatic until set: Chachu's family (the groom's) is invited to everything…
  await page.goto("/committee?family=groom&view=guests");
  await expect(page.getByLabel("Show Travel & Stay to Rohit Mehta")).toBeChecked();
  // …the bride's Office Gang to 3 of 5
  await page.goto("/committee?family=bride");
  await page.getByRole("navigation", { name: "View" }).getByRole("link", { name: /Guests ·/ }).click();
  await expect(page).toHaveURL(/view=guests/);
  const priya = page.getByLabel("Show Travel & Stay to Priya Nair");
  const kabir = page.getByLabel("Show Travel & Stay to Kabir Bose");
  const ishaan = page.getByLabel("Show Travel & Stay to Ishaan Verma");
  await expect(priya).not.toBeChecked();

  // ticking one guest ticks their whole family
  await priya.check();
  await expect(kabir).toBeChecked();
  await expect(ishaan).toBeChecked();
  await expect(page.getByText("Travel & Stay shown to Ananya's Office Gang")).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/guest-travel.png` });
  await page.reload();
  await expect(kabir).toBeChecked();
  // …and unticking one unticks them all
  await ishaan.uncheck();
  await expect(priya).not.toBeChecked();
  await expect(page.getByText("Travel & Stay hidden from Ananya's Office Gang")).toBeVisible();

  // the Families view has one box per family, with the same value
  await page.getByRole("link", { name: /^Families/ }).click();
  const row = page.getByRole("row", { name: /Ananya's Office Gang/ });
  const box = row.getByLabel("Show Travel & Stay to Ananya's Office Gang");
  await expect(box).not.toBeChecked();
  await box.check();
  await expect(page.getByText("Travel & Stay shown to Ananya's Office Gang")).toBeVisible();
  await box.uncheck();
  await expect(page.getByText("Travel & Stay hidden from Ananya's Office Gang")).toBeVisible();

  // in the family form, selecting every event ticks it
  await row.getByRole("button", { name: "edit" }).click();
  const dialog = page.getByRole("dialog");
  const formBox = dialog.getByLabel(/Show Travel & Stay on their wedding site/);
  await expect(formBox).not.toBeChecked();
  await dialog.getByRole("button", { name: "Haldi" }).click();
  await expect(formBox).not.toBeChecked();
  await dialog.getByRole("button", { name: "Mehendi" }).click();
  await expect(formBox).toBeChecked();
  if (shots) await page.screenshot({ path: `${shots}/family-travel.png` });
  await dialog.getByRole("button", { name: "Haldi" }).click(); // ticked by the rule, so it follows it back
  await expect(formBox).not.toBeChecked();
  await formBox.check(); // the committee's own choice sticks
  await dialog.getByRole("button", { name: "Sangeet" }).click();
  await expect(formBox).toBeChecked();
  await page.getByRole("button", { name: "Save family" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(box).toBeChecked();
});

test("the guest list: find a family, see who is still waiting, frozen titles, and cards on a phone", async ({ page }) => {
  await signIn(page, "couple@example.com");
  // the overview no longer repeats the navigation or the list of families
  await page.goto("/couple/groom");
  await expect(page.getByRole("link", { name: "Print invitation cards" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Still waiting on" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Who can reply to Arjun's side/ })).toBeVisible();
  // each family's name in the bar leads to its Overview, from any page
  await page.goto("/committee?family=groom");
  await expect(page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Ananya's side" })).toHaveAttribute("href", "/couple/bride");

  const rows = page.locator("tbody tr");
  const all = await rows.count();
  expect(all).toBeGreaterThan(1);
  const first = (await rows.first().locator("td").nth(1).locator("p").first().innerText()).trim();
  await page.getByRole("searchbox", { name: "Find a family" }).fill(first);
  await expect(rows).toHaveCount(1);
  await page.getByRole("searchbox", { name: "Find a family" }).fill("zzzz-nobody");
  await expect(page.getByText("No family matches that search.")).toBeVisible();
  await page.getByRole("searchbox", { name: "Find a family" }).fill("");
  // "Still waiting" narrows the list to families with no answer yet
  const waiting = page.getByRole("button", { name: /Still waiting · \d+/ });
  const n = Number((await waiting.innerText()).match(/\d+/)![0]);
  await waiting.click();
  await expect(waiting).toHaveAttribute("aria-pressed", "true");
  if (n) await expect(rows).toHaveCount(n); else await expect(page.getByText("Everyone has answered.")).toBeVisible();
  await waiting.click();

  // the buttons and the column titles stay in view while the rows scroll
  await page.setViewportSize({ width: 1440, height: 420 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const th = page.getByRole("columnheader", { name: "Primary contact" });
  const lastRow = await rows.last().boundingBox();
  if (lastRow && lastRow.y > 300) { // only when the list is long enough to scroll past its head
    await expect(page.getByRole("button", { name: "Add family" })).toBeInViewport();
    await expect(th).toBeInViewport();
  }
  // the page uses the width of the screen
  expect((await page.locator(".guest-table").boundingBox())!.width).toBeGreaterThan(1050);

  // on a phone each family is a card with everything reachable, and nothing scrolls sideways
  await page.setViewportSize({ width: 390, height: 800 });
  const cards = page.getByTestId("family-cards").getByRole("article");
  await expect(cards).toHaveCount(all);
  await expect(page.locator("table")).toHaveCount(0);
  await expect(cards.first().getByRole("button", { name: /Record RSVP/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (shots) await page.screenshot({ path: `${shots}/guests-phone.png` });
  // the site editor's parts become a "Jump to" menu
  await page.goto("/couple/site?family=groom");
  await page.getByText("Jump to a section").click();
  await page.getByRole("navigation", { name: "Jump to" }).getByRole("link", { name: "Travel & stay" }).click();
  await expect(page).toHaveURL(/#travel$/);
});
