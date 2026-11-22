import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";

/* Printed cards in Gujarati or Hindi: pick the language, check and edit every
   line (with our keyboard), print with a cover. The website is untouched. */

async function signIn(page: Page, email: string) {
  await page.goto("/signin");
  await page.fill("input[name=email]", email);
  await page.click("button[type=submit]");
  await expect(page.getByText(/on its way/i)).toBeVisible();
  const m = fs.readFileSync("var/outbox/mail.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l)).reverse().find((x) => x.to === email && x.signInUrl);
  await page.goto(m.signInUrl);
}
const shots = process.env.SHOTS_DIR;

test("Gujarati cards: our draft, your edits with the keyboard, a cover, and the website unchanged", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "couple@example.com");
  await page.goto("/couple/groom/print");

  // English by default; picking Gujarati offers the wording page
  const lang = page.getByLabel("Language on the card");
  await expect(lang).toHaveValue("en");
  await lang.selectOption("gu");
  await expect(page.getByTestId("language-note")).toContainText("only on the printed cards");
  if (shots) await page.getByTestId("card-language").screenshot({ path: `${shots}/print-language.png` });
  await page.getByTestId("edit-card-words").click();
  await expect(page).toHaveURL(/\/couple\/groom\/print\/words\?.*lang=gu/);

  // every line, English beside our Gujarati draft
  await expect(page.getByRole("heading", { name: /cards in Gujarati/ })).toBeVisible();
  const request = page.getByLabel("The invitation in Gujarati", { exact: true });
  await expect(request).toHaveValue(/આમંત્રણ/);
  const first = page.getByLabel("First name in Gujarati", { exact: true });
  const draft = await first.inputValue();
  expect(draft).toMatch(/[઀-૿]/);
  const save = page.getByTestId("floating-save");
  await expect(save).toHaveText("All changes saved");

  // our keyboard types into the box last clicked; "English letters" spells a word
  await first.fill("");
  await first.click();
  await page.getByTestId("keyboard-toggle").click();
  const kb = page.getByTestId("indic-keyboard");
  await kb.getByRole("button", { name: "Type અ", exact: true }).click();
  await kb.getByRole("button", { name: "Type ર", exact: true }).click();
  await kb.getByRole("button", { name: "Type ્", exact: true }).click();
  await kb.getByRole("button", { name: "Type જ", exact: true }).click();
  await kb.getByRole("button", { name: "Type ુ", exact: true }).click();
  await kb.getByRole("button", { name: "Type ન", exact: true }).click();
  await expect(first).toHaveValue("અર્જુન");
  await kb.getByRole("button", { name: "Space" }).click();
  await kb.getByLabel("Type a word in English letters").fill("Kapoor");
  await expect(kb.getByTestId("spelled")).toHaveText("કપૂર");
  await kb.getByRole("button", { name: "Insert" }).click();
  await expect(first).toHaveValue("અર્જુન કપૂર");
  await expect(page.getByText("Your words · back to our draft").first()).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/card-words-keyboard.png` });
  await save.click();
  await expect(save).toHaveText("All changes saved");
  await page.reload();
  await expect(page.getByLabel("First name in Gujarati", { exact: true })).toHaveValue("અર્જુન કપૂર");
  await expect(page.getByTestId("floating-save")).toHaveText("All changes saved");

  // back to our draft, and Hindi is its own set
  await page.getByRole("link", { name: /^Hindi/ }).click();
  await expect(page.getByLabel("First name in Hindi", { exact: true })).toHaveValue(/[ऀ-ॿ]/);

  // the card: Gujarati with a cover → a PDF with one more page
  const pdf = async (options: Record<string, unknown>) => {
    const res = await page.request.post("/couple/invitation", { data: { options: { version: "groom", ...options } } });
    expect(res.status()).toBe(200);
    const body = await res.body();
    return (body.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
  };
  const plain = await pdf({ lang: "gu" });
  expect(await pdf({ lang: "gu", cover: true })).toBe(plain + 1);
  expect(await pdf({ lang: "en", cover: true })).toBe(plain + 1);

  // the website is untouched
  await page.goto("/w/ananya-weds-arjun?side=groom&k=sample");
  await expect(page.getByText("અર્જુન કપૂર")).toHaveCount(0);
});
