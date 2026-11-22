import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/* Azure Translator, faked: names come back "spelled", text "translated". The
   saved-lines table is an in-memory list. */
const saved: { lang: string; kind: string; src: string; out: string }[] = [];
vi.mock("@/db/client", () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => [...saved] }) }),
    insert: () => ({ values: (rows: typeof saved) => ({ onConflictDoNothing: async () => { saved.push(...rows); } }) }),
  },
}));

import { localizeCards } from "@/lib/invitation/machine";
import { localize } from "@/lib/invitation/i18n";
import { invitationSchema } from "@/lib/invitation/options";

const w = { brideName: "Pooja Kumari", groomName: "Spandan Kosambi", weddingDate: new Date("2027-01-29T05:00:00Z"), city: "Pune", rsvpDeadline: new Date("2027-01-10T00:00:00Z"), brideParents: null, groomParents: "Mr. Rajesh & Mrs. Manisha Kosambi" };
const evs = [{ id: "11111111-1111-4111-8111-111111111111", name: "Haldi", side: "both" as const, startsAt: new Date("2027-01-28T04:30:00Z"), timeZone: "Asia/Kolkata", venueName: "Shubh Lawns", address: "Near Law Garden, Ahmedabad", dressCode: "Something yellow", isPublished: true, sortOrder: 1 }];
const o = invitationSchema.parse({ version: "groom", lang: "gu", eventLayout: "separate", dressCode: true });

let calls: { url: string; texts: string[]; key: string | null }[] = [];
beforeEach(() => {
  saved.length = 0; calls = [];
  process.env.AZURE_TRANSLATOR_KEY = "test-key";
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const texts = (JSON.parse(init.body as string) as { Text: string }[]).map((x) => x.Text);
    calls.push({ url, texts, key: (init.headers as Record<string, string>)["Ocp-Apim-Subscription-Key"] });
    const body = url.includes("/transliterate")
      ? texts.map((t) => ({ text: `NAME(${t})`, script: "Gujr" }))
      : texts.map((t) => ({ translations: [{ text: `TEXT(${t})`, to: "gu" }] }));
    return new Response(JSON.stringify(body), { status: 200 });
  }));
});
afterEach(() => { delete process.env.AZURE_TRANSLATOR_KEY; vi.unstubAllGlobals(); });

describe("Azure Translator for Gujarati / Hindi cards", () => {
  it("spells names, translates free text, keeps our phrases, and saves each line", async () => {
    const { inv } = await localizeCards(w, evs, o, "https://x.test", "gu");
    expect(inv.front.first).toBe("NAME(Spandan Kosambi)");
    expect(inv.front.second).toBe("NAME(Pooja Kumari)");
    const e = inv.inserts[0].event;
    expect(e.venue).toBe("TEXT(Shubh Lawns)");
    expect(e.address).toBe("TEXT(Near Law Garden, Ahmedabad)");
    expect(e.dressCode).toBe("TEXT(Something yellow)");
    expect(e.name).toBe("હલદી"); // our dictionary still wins for known celebrations
    expect(calls.every((c) => c.key === "test-key")).toBe(true);
    expect(calls.map((c) => c.url)).toEqual(expect.arrayContaining([expect.stringContaining("toScript=Gujr"), expect.stringContaining("to=gu")]));

    // the second time, everything comes from the saved lines: no calls
    const before = calls.length;
    await localizeCards(w, evs, o, "https://x.test", "gu");
    expect(calls.length).toBe(before);
  });

  it("the family's own words still win over the machine", async () => {
    const { inv } = await localizeCards(w, evs, o, "https://x.test", "gu", { first: "સ્પંદન" });
    expect(inv.front.first).toBe("સ્પંદન");
  });

  it("falls back to our spelling rules when Azure fails, or without a key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("quota", { status: 403 })));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const plain = localize(w, evs, o, "https://x.test", "gu").inv;
    expect((await localizeCards(w, evs, o, "https://x.test", "gu")).inv.front.first).toBe(plain.front.first);
    expect(warn).toHaveBeenCalled();
    delete process.env.AZURE_TRANSLATOR_KEY;
    expect((await localizeCards(w, evs, o, "https://x.test", "gu")).inv.front.first).toBe(plain.front.first);
  });
});
