import * as XLSX from "xlsx";
import { requireAccess } from "@/lib/authz";
import { asFamilySide } from "@/lib/looks";
import { guestSheet, COLS } from "@/lib/guest-sheet";

/**
 * GET /committee/export?family=bride&format=xlsx|csv — this family's guest
 * list as a spreadsheet: a row per guest, with the ids a re-upload needs to
 * apply only what changed. Anyone who can see the guest list can download it.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const family = asFamilySide(url.searchParams.get("family")) ?? "bride";
  const staff = await requireAccess("guests", family, "view");
  const weddingId = staff.role === "admin" ? url.searchParams.get("wedding") : staff.weddingId;
  if (!weddingId) return new Response("No wedding", { status: 404 });

  const { title, header, rows } = await guestSheet(weddingId, family);
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `${title.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}-${stamp}`;
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

  if (url.searchParams.get("format") === "csv") {
    // a cell that a spreadsheet would run as a formula gets a leading ' (phone numbers like +91… are left alone)
    const risky = (v: string) => /^[=@\t\r]/.test(v) || /^[+\-][^\d\s(]/.test(v);
    const esc = (v: string) => { const s = risky(v) ? `'${v}` : v; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = "﻿" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
    return new Response(csv, { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"` } });
  }

  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  sheet["!cols"] = header.map((h, i) => ({ wch: i < 2 ? 12 : Math.min(40, Math.max(12, h.length + 2, ...rows.map((r) => (r[i] ?? "").length + 1))) }));
  sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: header.length - 1 } }) };
  XLSX.utils.book_append_sheet(wb, sheet, "Guest list");
  const help = XLSX.utils.aoa_to_sheet([
    ["How to update your guest list with this file"],
    [""],
    ["1. Edit names, contact details, Travel & Stay, Hotel, Room No. or 'Invited to' right in the Guest list sheet."],
    ["2. To add someone, add a row with their name and Household (an existing household, or a new name). Leave the two ID cells empty."],
    [`3. Keep the "${COLS.guestId}" and "${COLS.householdId}" cells as they are — they tell us which guest each row is.`],
    ["4. Upload the file on the guest list page (Update from spreadsheet). You'll see every change before anything is saved."],
    [""],
    ["Nothing is deleted: a guest you remove from the sheet stays on the list. Remove people in the app."],
    ["The RSVP columns are for reference; replies are recorded in the app."],
    ["'Invited to' lists celebrations separated by commas, using the names in this sheet."],
  ]);
  help["!cols"] = [{ wch: 110 }];
  XLSX.utils.book_append_sheet(wb, help, "How to update");
  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new Response(new Uint8Array(buf), {
    headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${base}.xlsx"` },
  });
}
