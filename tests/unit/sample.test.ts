import { describe, it, expect } from "vitest";
import { asSampleDates, sampleShift, SAMPLE_SLUG } from "@/lib/sample";

describe("the example wedding", () => {
  const now = new Date("2026-11-23T14:00:00Z");
  const w = { slug: SAMPLE_SLUG, weddingDate: new Date("2026-11-20T05:30:00Z"), rsvpDeadline: new Date("2026-11-01T00:00:00Z") };
  const evs = [{ startsAt: new Date("2026-11-18T13:00:00Z") }, { startsAt: new Date("2026-11-20T05:30:00Z") }];

  it("is always 60 days away, at the same time of day, with every celebration moved alike", () => {
    const { wedding, events } = asSampleDates(w, evs, now);
    expect(wedding.weddingDate.toISOString()).toBe("2027-01-22T05:30:00.000Z");
    expect(events.map((e) => e.startsAt.toISOString())).toEqual(["2027-01-20T13:00:00.000Z", "2027-01-22T05:30:00.000Z"]);
    expect(wedding.rsvpDeadline!.toISOString()).toBe("2026-12-23T05:30:00.000Z"); // a month before
    // a day later, it's still 60 days away
    const later = asSampleDates(w, evs, new Date("2026-11-24T14:00:00Z")).wedding.weddingDate;
    expect(later.toISOString()).toBe("2027-01-23T05:30:00.000Z");
    expect(sampleShift(w.weddingDate, now) % 86_400_000).toBe(0);
  });

  it("leaves every other wedding alone", () => {
    const other = { ...w, slug: "ananya-weds-arjun-2" };
    expect(asSampleDates(other, evs, now)).toEqual({ wedding: other, events: evs });
  });
});
