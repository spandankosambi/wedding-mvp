import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { events, families, guests, eventInvites, rsvps, weddings, type GuestColumn } from "@/db/schema";
import { eventForSide, eventLabel } from "@/lib/sides";
import { sideNamesOf } from "@/lib/side-names";
import { showsTravel } from "@/lib/travel";
import { getLook, type FamilySide } from "@/lib/looks";
import { guestHotel, pruneAttendees } from "@/lib/household";
import { syncHousehold } from "@/lib/primary";
import { normalizePersonName } from "@/lib/import/match";

/*
 * One family's guest list as a spreadsheet, and back again.
 *
 * The download has a row per guest. Its first two columns carry the guest's
 * and household's ids, so a re-upload matches every row to exactly the guest
 * it came from: only what was changed is applied, nobody is duplicated, and
 * nobody is removed (a guest missing from the sheet is simply left as is).
 * Rows without an id are new guests — they join the household named on the
 * row (or a new household), unless that household already has someone of the
 * same name. RSVP columns are for reference; replies are recorded in the app.
 */

export const COLS = {
  guestId: "Guest ID (keep)",
  householdId: "Household ID (keep)",
  household: "Household",
  family: "Family",
  relation: "Relation",
  guest: "Guest name",
  age: "Adult or child",
  primary: "Primary contact",
  email: "Email",
  phone: "Phone / WhatsApp",
  travel: "Travel & Stay",
  hotel: "Hotel",
  room: "Room No.",
  invited: "Invited to",
} as const;
const RSVP_PREFIX = "RSVP: ";

type Snapshot = Awaited<ReturnType<typeof load>>;

async function load(weddingId: string, family: FamilySide) {
  const [[w], allEvents, fams, look] = await Promise.all([
    db.select().from(weddings).where(eq(weddings.id, weddingId)),
    db.select().from(events).where(eq(events.weddingId, weddingId)).orderBy(events.sortOrder),
    db.select().from(families).where(and(eq(families.weddingId, weddingId), eq(families.side, family))).orderBy(families.createdAt),
    getLook(weddingId, family),
  ]);
  const names = sideNamesOf(w);
  const evs = allEvents.filter((e) => eventForSide(e.side, family));
  const ids = fams.map((f) => f.id);
  const [gs, invites, answers] = ids.length
    ? await Promise.all([
        db.select().from(guests).where(inArray(guests.familyId, ids)).orderBy(guests.seq),
        db.select().from(eventInvites).where(inArray(eventInvites.familyId, ids)),
        db.select().from(rsvps).where(inArray(rsvps.familyId, ids)),
      ])
    : [[], [], []];
  const hotels = [...new Set((look.travel?.stays ?? []).map((s) => s.name.trim()).filter(Boolean))];
  const columns: GuestColumn[] = w.guestColumns ?? [];
  const households = fams.map((f) => {
    const eventIds = invites.filter((i) => i.familyId === f.id).map((i) => i.eventId);
    return {
      ...f,
      members: gs.filter((g) => g.familyId === f.id),
      eventIds,
      travel: showsTravel(f.showTravel, eventIds, evs.map((e) => e.id)),
      answers: answers.filter((r) => r.familyId === f.id),
    };
  });
  return { wedding: w, names, evs, households, hotels, columns, familyLabel: `${names[family]}'s family` };
}

const yes = (b: boolean) => (b ? "Yes" : "No");
const evName = (s: Snapshot, e: Snapshot["evs"][number]) => eventLabel(e, s.names);

/** The download: a header row, then a row per guest. */
export async function guestSheet(weddingId: string, family: FamilySide): Promise<{ title: string; header: string[]; rows: string[][] }> {
  const s = await load(weddingId, family);
  const header = [
    COLS.guestId, COLS.householdId, COLS.household, COLS.family, COLS.relation, COLS.guest, COLS.age, COLS.primary,
    COLS.email, COLS.phone, COLS.travel, COLS.hotel, COLS.room, ...s.columns.map((c) => c.label), COLS.invited,
    ...s.evs.map((e) => RSVP_PREFIX + evName(s, e)),
  ];
  const rows: string[][] = [];
  for (const h of s.households) {
    for (const g of h.members) {
      const rsvpCells = s.evs.map((e) => {
        if (!h.eventIds.includes(e.id)) return "Not invited";
        const a = h.answers.find((r) => r.eventId === e.id);
        if (!a) return "No reply yet";
        if (a.status === "declined") return "Not attending";
        const named = a.guestIds?.length ? a.guestIds.includes(g.id) : null;
        return named === false ? "Not attending" : `Attending${named === null ? ` (family of ${a.headcount})` : ""}`;
      });
      rows.push([
        g.id, h.id, h.name, s.familyLabel, h.relation ?? "", g.fullName, g.ageGroup === "child" ? "Child" : "Adult", yes(g.isPrimary),
        g.email ?? "", g.phone ?? "", yes(h.travel),
        guestHotel(g.details, h.travel, s.hotels), h.travel ? g.details?.room ?? "" : "",
        ...s.columns.map((c) => g.details?.[c.id] ?? ""),
        s.evs.filter((e) => h.eventIds.includes(e.id)).map((e) => evName(s, e)).join(", "),
        ...rsvpCells,
      ]);
    }
  }
  return { title: `${s.names[family]}'s family guest list`, header, rows };
}

/* ── Re-upload ───────────────────────────────────────────────────────── */

export type SheetChange = { kind: "new-household" | "new-guest" | "update" | "skip"; text: string };
export type SheetPlan = {
  changes: SheetChange[];
  errors: string[];
  /** guests on the list that the sheet didn't change (or didn't mention) */
  unchanged: number;
  /** how many changes would be written */
  count: number;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
// a leading ' is how spreadsheets mark "keep this as text" — not part of the value
const cell = (v: unknown) => (v == null ? "" : String(v).trim().replace(/^'/, ""));
const emailOk = (v: string) => !v || z.string().email().safeParse(v).success;
const phoneOk = (v: string) => !v || v.replace(/\D/g, "").length >= 8;
const ageOf = (v: string): "adult" | "child" | null => (!v ? null : /^c|kid|minor/i.test(v) ? "child" : /^a/i.test(v) ? "adult" : null);
const yesNo = (v: string): boolean | null => (!v ? null : /^(y|yes|true|1|✓)$/i.test(v) ? true : /^(n|no|false|0|✗)$/i.test(v) ? false : null);

type GuestPatch = { fullName?: string; ageGroup?: "adult" | "child"; email?: string | null; phone?: string | null; details?: Record<string, string> };
type HouseholdPatch = { name?: string; relation?: string | null; showTravel?: boolean; eventIds?: string[] };
type NewGuest = { fullName: string; ageGroup: "adult" | "child"; email: string | null; phone: string | null; details: Record<string, string> };
type Work = {
  guestPatches: Map<string, GuestPatch>;
  householdPatches: Map<string, HouseholdPatch>;
  newGuests: Map<string, NewGuest[]>; // existing household id → people to add
  newHouseholds: { name: string; relation: string | null; showTravel: boolean | null; eventIds: string[]; members: NewGuest[] }[];
};

/**
 * Compare an uploaded sheet with the list as it is now. With `apply`, also
 * write the changes. Either way returns what changes (in words), what was
 * skipped and why, and any rows that need fixing first.
 */
export async function updateFromSheet(weddingId: string, family: FamilySide, table: unknown[][], apply: boolean): Promise<SheetPlan> {
  const s = await load(weddingId, family);
  const plan: SheetPlan = { changes: [], errors: [], unchanged: 0, count: 0 };
  const work: Work = { guestPatches: new Map(), householdPatches: new Map(), newGuests: new Map(), newHouseholds: [] };

  // find the header row (the first row naming "Guest name"), and each column by its title
  const hi = table.findIndex((r) => r.some((c) => norm(cell(c)) === norm(COLS.guest)));
  if (hi < 0) { plan.errors.push(`This doesn't look like a guest list we made: there's no "${COLS.guest}" column. Download the list, edit it, and upload that file.`); return plan; }
  const head = table[hi].map((c) => norm(cell(c)));
  const col = (title: string) => head.indexOf(norm(title));
  const at = (row: unknown[], title: string) => { const i = col(title); return i < 0 ? null : cell(row[i]); };
  const has = (title: string) => col(title) >= 0;

  const guestById = new Map(s.households.flatMap((h) => h.members.map((g) => [g.id, { g, h }] as const)));
  const householdById = new Map(s.households.map((h) => [h.id, h]));
  const householdByName = new Map(s.households.map((h) => [norm(h.name), h]));
  const eventByName = new Map(s.evs.flatMap((e) => [[norm(evName(s, e)), e.id], [norm(e.name), e.id]] as const));
  const seenGuests = new Set<string>();
  const seenHouseholds = new Set<string>();

  const parseEvents = (v: string, rowNo: number): string[] | null => {
    const parts = v.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
    const ids: string[] = [];
    for (const p of parts) {
      const id = eventByName.get(norm(p));
      if (!id) { plan.errors.push(`Row ${rowNo}: "${p}" isn't one of this family's celebrations.`); return null; }
      if (!ids.includes(id)) ids.push(id);
    }
    return ids;
  };
  const checkHotel = (v: string, rowNo: number) => {
    if (v && s.hotels.length && !s.hotels.some((h) => norm(h) === norm(v))) { plan.errors.push(`Row ${rowNo}: "${v}" isn't one of the hotels in your Travel & stay.`); return false; }
    return true;
  };

  for (let r = hi + 1; r < table.length; r++) {
    const row = table[r];
    const rowNo = r + 1;
    const name = at(row, COLS.guest) ?? "";
    const gid = at(row, COLS.guestId) ?? "";
    const hid = at(row, COLS.householdId) ?? "";
    const household = at(row, COLS.household) ?? "";
    if (!name && !gid && !household) continue; // a blank row

    const email = (at(row, COLS.email) ?? "").toLowerCase();
    const phone = at(row, COLS.phone) ?? "";
    const ageText = at(row, COLS.age) ?? "";
    const age = ageOf(ageText);
    if (has(COLS.email) && !emailOk(email)) { plan.errors.push(`Row ${rowNo}: "${email}" isn't a valid email.`); continue; }
    if (has(COLS.phone) && !phoneOk(phone)) { plan.errors.push(`Row ${rowNo}: "${phone}" needs at least 8 digits.`); continue; }
    if (ageText && !age) { plan.errors.push(`Row ${rowNo}: "Adult or child" should say Adult or Child.`); continue; }

    // ── a guest already on the list ──
    if (gid) {
      const found = guestById.get(gid);
      if (!found) { plan.errors.push(`Row ${rowNo}: ${name || "this guest"} is no longer on ${s.familyLabel}'s list. Clear the ID cells on that row to add them again as new.`); continue; }
      if (seenGuests.has(gid)) { plan.changes.push({ kind: "skip", text: `Row ${rowNo}: ${found.g.fullName} appears twice — kept the first row.` }); continue; }
      seenGuests.add(gid);
      const { g, h } = found;
      if (!name) { plan.errors.push(`Row ${rowNo}: the guest name is empty.`); continue; }
      const p: GuestPatch = {};
      const said: string[] = [];
      const diff = (label: string, before: string, after: string) => said.push(`${label} ${before ? `"${before}"` : "(empty)"} → ${after ? `"${after}"` : "(empty)"}`);
      if (name !== g.fullName) { p.fullName = name; diff("name", g.fullName, name); }
      if (age && age !== g.ageGroup) { p.ageGroup = age; diff("adult/child", g.ageGroup, age); }
      if (has(COLS.email) && email !== (g.email ?? "")) { p.email = email || null; diff("email", g.email ?? "", email); }
      if (has(COLS.phone) && phone !== (g.phone ?? "")) { p.phone = phone || null; diff("phone", g.phone ?? "", phone); }
      const details = { ...(g.details ?? {}) };
      let detailsChanged = false;
      const hotel = at(row, COLS.hotel);
      if (hotel !== null && hotel !== guestHotel(g.details, h.travel, s.hotels)) {
        if (!checkHotel(hotel, rowNo)) continue;
        const canonical = s.hotels.find((x) => norm(x) === norm(hotel)) ?? hotel;
        if (canonical) details.hotel = canonical; else delete details.hotel;
        detailsChanged = true; diff("hotel", guestHotel(g.details, h.travel, s.hotels), canonical);
      }
      const room = at(row, COLS.room);
      if (room !== null && room !== (h.travel ? g.details?.room ?? "" : "") && (room || g.details?.room)) {
        if (room) details.room = room.slice(0, 200); else delete details.room;
        detailsChanged = true; diff("room", g.details?.room ?? "", room);
      }
      for (const c of s.columns) {
        const v = at(row, c.label);
        if (v === null || v === (g.details?.[c.id] ?? "")) continue;
        if (v) details[c.id] = v.slice(0, 200); else delete details[c.id];
        detailsChanged = true; diff(c.label, g.details?.[c.id] ?? "", v);
      }
      if (detailsChanged) p.details = details;
      if (said.length) {
        work.guestPatches.set(g.id, p);
        plan.changes.push({ kind: "update", text: `${h.name} · ${g.fullName}: ${said.join(", ")}` });
      } else plan.unchanged++;

      // household details, from the first row of each household
      if (!seenHouseholds.has(h.id)) {
        seenHouseholds.add(h.id);
        const hp: HouseholdPatch = {};
        const hs: string[] = [];
        if (household && household !== h.name) { hp.name = household; hs.push(`name "${h.name}" → "${household}"`); }
        const relation = at(row, COLS.relation);
        if (relation !== null && relation !== (h.relation ?? "")) { hp.relation = relation || null; hs.push(`relation → ${relation ? `"${relation}"` : "(empty)"}`); }
        const travel = yesNo(at(row, COLS.travel) ?? "");
        if (travel !== null && travel !== h.travel) { hp.showTravel = travel; hs.push(`Travel & Stay → ${yes(travel)}`); }
        const invited = at(row, COLS.invited);
        if (invited !== null) {
          const ids = parseEvents(invited, rowNo);
          if (!ids) continue;
          const before = new Set(h.eventIds);
          if (ids.length !== before.size || ids.some((id) => !before.has(id))) {
            hp.eventIds = ids;
            hs.push(`invited to → ${ids.length ? s.evs.filter((e) => ids.includes(e.id)).map((e) => evName(s, e)).join(", ") : "nothing"}`);
          }
        }
        if (hs.length) { work.householdPatches.set(h.id, hp); plan.changes.push({ kind: "update", text: `${h.name}: ${hs.join(", ")}` }); }
      }
      continue;
    }

    // ── a new person ──
    if (!name) { plan.errors.push(`Row ${rowNo}: a new row needs a guest name.`); continue; }
    const hotel = at(row, COLS.hotel) ?? "";
    if (!checkHotel(hotel, rowNo)) continue;
    const details: Record<string, string> = {};
    if (hotel) details.hotel = s.hotels.find((x) => norm(x) === norm(hotel)) ?? hotel;
    const room = at(row, COLS.room) ?? "";
    if (room) details.room = room.slice(0, 200);
    for (const c of s.columns) { const v = at(row, c.label); if (v) details[c.id] = v.slice(0, 200); }
    const person: NewGuest = { fullName: name, ageGroup: age ?? "adult", email: email || null, phone: phone || null, details };

    const target = (hid && householdById.get(hid)) || (household ? householdByName.get(norm(household)) : undefined);
    if (hid && !householdById.get(hid) && !household) { plan.errors.push(`Row ${rowNo}: that household is no longer on the list. Add a Household name to start a new one.`); continue; }
    if (target) {
      const pending = work.newGuests.get(target.id) ?? [];
      const same = (n: string) => normalizePersonName(n) === normalizePersonName(name);
      if (target.members.some((m) => same(m.fullName)) || pending.some((m) => same(m.fullName))) {
        plan.changes.push({ kind: "skip", text: `Row ${rowNo}: ${name} is already in ${target.name} — not added twice.` });
        continue;
      }
      pending.push(person);
      work.newGuests.set(target.id, pending);
      plan.changes.push({ kind: "new-guest", text: `New guest: ${name} in ${target.name}` });
      continue;
    }
    if (!household) { plan.errors.push(`Row ${rowNo}: a new guest needs a Household (an existing one, or the name of a new one).`); continue; }
    let fresh = work.newHouseholds.find((x) => norm(x.name) === norm(household));
    if (!fresh) {
      const invited = at(row, COLS.invited);
      const ids = invited ? parseEvents(invited, rowNo) : s.evs.map((e) => e.id);
      if (!ids) continue;
      fresh = { name: household, relation: at(row, COLS.relation) || null, showTravel: yesNo(at(row, COLS.travel) ?? ""), eventIds: ids, members: [] };
      work.newHouseholds.push(fresh);
    }
    if (fresh.members.some((m) => normalizePersonName(m.fullName) === normalizePersonName(name))) {
      plan.changes.push({ kind: "skip", text: `Row ${rowNo}: ${name} appears twice in ${household} — added once.` });
      continue;
    }
    fresh.members.push(person);
  }
  for (const h of work.newHouseholds) {
    plan.changes.push({ kind: "new-household", text: `New household: ${h.name} — ${h.members.map((m) => m.fullName).join(", ")}` });
  }
  plan.unchanged += s.households.reduce((n, h) => n + h.members.filter((g) => !seenGuests.has(g.id)).length, 0);
  plan.count = plan.changes.filter((c) => c.kind !== "skip").length;

  if (apply && !plan.errors.length && plan.count) await write(weddingId, family, s, work);
  return plan;
}

async function write(weddingId: string, family: FamilySide, s: Snapshot, work: Work) {
  const touched = new Set<string>();
  for (const [id, p] of work.guestPatches) {
    await db.update(guests).set(p).where(eq(guests.id, id));
    const fam = s.households.find((h) => h.members.some((g) => g.id === id));
    if (fam) touched.add(fam.id);
  }
  for (const [id, p] of work.householdPatches) {
    const { eventIds, ...fields } = p;
    if (Object.keys(fields).length) await db.update(families).set(fields).where(and(eq(families.id, id), eq(families.weddingId, weddingId)));
    if (eventIds) {
      await db.delete(eventInvites).where(eq(eventInvites.familyId, id));
      if (eventIds.length) await db.insert(eventInvites).values(eventIds.map((eventId) => ({ eventId, familyId: id })));
    }
    touched.add(id);
  }
  for (const [id, people] of work.newGuests) {
    await db.insert(guests).values(people.map((m) => ({ familyId: id, ...m })));
    touched.add(id);
  }
  for (const h of work.newHouseholds) {
    const [f] = await db.insert(families).values({ weddingId, name: h.name, side: family, relation: h.relation, email: "", showTravel: h.showTravel, source: "import" }).returning();
    await db.insert(guests).values(h.members.map((m) => ({ familyId: f.id, ...m })));
    if (h.eventIds.length) await db.insert(eventInvites).values(h.eventIds.map((eventId) => ({ eventId, familyId: f.id })));
    touched.add(f.id);
  }
  for (const id of touched) { await syncHousehold(id); await pruneAttendees(id); }
}
