"use client";

import { whatsappInviteAction } from "./actions";

/**
 * Opens WhatsApp with the family's invitation typed out. The tab is opened
 * inside the click (so browsers don't block it) and pointed at WhatsApp once
 * the server has minted the personal link.
 */
export async function openWhatsAppInvite(weddingId: string, familyId: string): Promise<{ ok: boolean; error?: string; to?: string | null }> {
  const tab = window.open("", "_blank");
  const r = await whatsappInviteAction({ weddingId, familyId });
  if (!r.ok) { tab?.close(); return { ok: false, error: r.error }; }
  if (tab) tab.location.href = r.url;
  else window.location.href = r.url; // popup blocked: go there directly
  return { ok: true, to: r.to };
}
