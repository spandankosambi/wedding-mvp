import fs from "node:fs";
import { test, expect, type Page } from "@playwright/test";

/* The ring of six invitations on the landing page.
   Regressions: half the ring was invisible (rear cards hidden outright),
   the only way to close an opened card was a 32x18px link, and nothing
   happened on hover. */

async function settle(page: Page) {
  // the ring paints from a rAF loop; give it a couple of frames
  await page.waitForFunction(() => document.querySelectorAll(".wheel-item").length === 6);
  await page.waitForTimeout(120);
  // a pointer over the stage holds the ring still, as it does for a person
  const st = (await page.locator(".wheel-stage").boundingBox())!;
  await page.mouse.move(st.x + st.width / 2, st.y + 8);
  await page.waitForTimeout(150);
}

async function frontCover(page: Page) {
  return page.locator('.wheel-item[data-front="true"] .card3d-cover');
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await settle(page);
});

test("all six cards are on show: a face or a back plate, none faded to nothing", async ({ page }) => {
  const state = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".wheel-item")].map((it) => {
      const back = it.dataset.back === "true";
      const face = it.querySelector(".card3d") as HTMLElement;
      // a rear card shows its plate (::before); a front one shows its face
      const shown = back ? getComputedStyle(it, "::before") : getComputedStyle(face);
      return { visibility: getComputedStyle(it).visibility, shownVisibility: shown.visibility, opacity: parseFloat(shown.opacity) };
    }),
  );
  expect(state).toHaveLength(6);
  for (const s of state) {
    expect(s.visibility).toBe("visible");
    expect(s.shownVisibility).toBe("visible");
    expect(s.opacity).toBeGreaterThanOrEqual(0.35);
  }
});

test("the front card opens on tap and closes on a tap anywhere on the page, or Escape", async ({ page }) => {
  const cover = await frontCover(page);
  await cover.click({ force: true });
  const open = page.locator('.card3d[data-open="true"]');
  await expect(open).toHaveCount(1);
  await page.waitForTimeout(1000); // cover swing

  // tap the middle of the open page: no need to find a tiny link
  const box = (await open.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(open).toHaveCount(0);
  await page.waitForTimeout(1000); // cover swings shut before it takes the next tap

  await (await frontCover(page)).click({ force: true });
  await expect(open).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(open).toHaveCount(0);
});

test("the close control is a real target, not a hairline link", async ({ page }) => {
  await (await frontCover(page)).click({ force: true });
  await page.waitForTimeout(1000);
  const box = (await page.locator('.card3d[data-open="true"] .card3d-inner button').boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(26);
  expect(box.width).toBeGreaterThanOrEqual(60);
});

test("a card grows under the pointer", async ({ page }) => {
  const cover = await frontCover(page);
  const card = cover.locator("..");
  const scaleOf = () =>
    card.evaluate((el) => {
      const m = getComputedStyle(el).transform;
      if (m === "none") return 1;
      const v = m.replace(/matrix(3d)?\(/, "").split(",").map(Number);
      return v.length === 16 ? Math.hypot(v[0], v[1], v[2]) : Math.hypot(v[0], v[1]);
    });
  expect(await scaleOf()).toBeCloseTo(1, 2);
  await cover.hover({ force: true });
  await page.waitForTimeout(700);
  expect(await scaleOf()).toBeGreaterThan(1.03);
});

/* The inside page painted under every closed cover, and on a phone-sized
   card the Close button overflowed the page and hung below each card. */
for (const width of [390, 1280]) {
  test(`a closed card shows nothing of its inside page (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await settle(page);
    const inner = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".wheel .card3d-inner")].map((el) => ({
        overflow: el.scrollHeight - el.clientHeight,
        shown: [...el.children].filter((c) => getComputedStyle(c).visibility !== "hidden").length,
      })),
    );
    for (const s of inner) {
      expect(s.overflow).toBeLessThanOrEqual(0);
      expect(s.shown).toBe(0);
    }
  });
}

test("the product is One Tap Invites everywhere a visitor or a share preview looks", async ({ page }) => {
  await expect(page).toHaveTitle("One Tap Invites — Invites, RSVPs and guests, sorted.");
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute("content", "One Tap Invites");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /One Tap Invites/);
  // the logo is drawn, not typed: it is found by its accessible name
  await expect(page.locator("header.nav").getByRole("img", { name: "One Tap Invites" })).toBeVisible();
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveCount(1);
  const foot = page.locator("footer").last();
  await expect(foot).toContainText("Invites, RSVPs and guests, sorted.");
  await expect(foot.getByTestId("copyright")).toHaveText("© 2026 One Tap Invites · A product of The Event Day Desk");
  await expect(page.locator("body")).not.toContainText(/nimantran/i);
  await page.goto("/signin");
  await expect(page).toHaveTitle(/One Tap Invites/);
  await expect(page.getByRole("img", { name: "One Tap Invites" })).toBeVisible();
  await page.goto("/w/ananya-weds-arjun?k=sample");
  await expect(page).toHaveTitle(/· One Tap Invites$/);
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute("content", "One Tap Invites");
  // guests can find who made the invitation, and how to reach us
  const made = page.locator("footer").getByTestId("made-with");
  await expect(made.getByRole("link", { name: "One Tap Invites" })).toHaveAttribute("href", "https://onetapinvites.com/?from=invite");
  // on its own line, opening a form that reaches our inbox
  const ask = made.getByRole("button", { name: "Questions or feedback? Contact us" });
  await ask.click();
  const dialog = page.getByRole("dialog", { name: "Questions or feedback?" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Your name").fill("Meera");
  await dialog.getByLabel("Your email").fill("meera@example.com");
  await dialog.getByLabel("What is it about?").selectOption("I'd like one for my own event");
  await dialog.getByLabel("Your message").fill("Loved this invitation. How do I make one?");
  await dialog.getByRole("button", { name: "Send message" }).click();
  await expect(dialog.getByRole("status")).toContainText("meera@example.com");
  const mail = fs.readFileSync("var/outbox/mail.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l)).reverse()
    .find((m) => m.to === "onetapinvites@gmail.com" && /Guest · I'd like one/.test(m.subject));
  expect(mail.html).toContain("Loved this invitation");
  expect(mail.html).not.toContain("k=sample"); // the private code stays out
  await dialog.getByRole("button", { name: "Done" }).click();
  // the landing page offers the form, not a bare email address
  await page.goto("/");
  await expect(page.getByText(/Or write to/)).toHaveCount(0);
  await page.goto("/w/ananya-weds-arjun/rsvp?k=sample");
  await expect(page.getByTestId("made-with")).toBeVisible();
  await page.goto("/#contact");
  await expect(page.locator("#contact").getByRole("button", { name: "Questions or feedback? Contact us" })).toBeVisible();
});
