"use server";

import * as XLSX from "xlsx";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/authz";
import { allows } from "@/lib/auth/access";
import { asFamilySide } from "@/lib/site/looks";
import { isOurSheet, updateFromSheet, type SheetPlan } from "@/lib/guests/guest-sheet";

const MAX_BYTES = 5 * 1024 * 1024;

export type SheetUpdateResult =
  | { ok: true; plan: SheetPlan; applied: boolean }
  /** with "onlyOurs": the file isn't one of our sheets, so the import screen reads it its usual way */
  | { ok: true; ours: false }
  | { ok: false; error: string };

/**
 * "Update from spreadsheet": the file is read and compared with the list.
 * Without `apply` nothing is saved — the couple sees exactly what would
 * change; with it, the same comparison is made again and written.
 */
export async function sheetUpdateAction(formData: FormData): Promise<SheetUpdateResult> {
  const staff = await requireRole(["committee", "couple", "admin"]);
  const family = asFamilySide(formData.get("family"));
  if (!family) return { ok: false, error: "invalid input" };
  const weddingId = staff.role === "admin" ? String(formData.get("weddingId") ?? "") : staff.weddingId;
  if (!weddingId || !allows(staff.access, "guests", family, "full")) return { ok: false, error: "You need full access to this guest list to update it." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose the spreadsheet to upload." };
  if (file.size > MAX_BYTES) return { ok: false, error: "That file is over 5 MB." };
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return { ok: false, error: "Upload an Excel (.xlsx) or CSV file." };

  let table: unknown[][];
  try {
    const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer", raw: false, codepage: 65001 });
    const name = wb.SheetNames.includes("Guest list") ? "Guest list" : wb.SheetNames[0];
    table = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: false, defval: "" });
  } catch {
    return { ok: false, error: "We couldn't read that file. Save it as .xlsx or .csv and try again." };
  }
  if (formData.get("onlyOurs") === "1" && !isOurSheet(table)) return { ok: true, ours: false };
  const apply = formData.get("apply") === "1";
  const plan = await updateFromSheet(weddingId, family, table, apply);
  const applied = apply && !plan.errors.length && plan.count > 0;
  if (applied) { revalidatePath("/committee"); revalidatePath("/couple", "layout"); }
  return { ok: true, plan, applied };
}
