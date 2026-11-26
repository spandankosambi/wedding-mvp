import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { rishtaProfiles } from "@/db/schema";
import { RISHTA_COOKIE, sessionProfileId } from "@/lib/rishta/profiles";
import { photoVisibleTo } from "@/lib/rishta/match";

/*
 * A Rishta Corner photo, only for: its owner, a single who may see that
 * profile right now, or the wedding's hosts (couple, or admin). Everyone
 * else gets "not found". The photo's storage address is never sent out.
 */

export const dynamic = "force-dynamic";
const NOPE = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

async function hostOf(weddingId: string): Promise<boolean> {
  const { auth } = await import("@/auth");
  const u = (await auth())?.user as { role?: string; weddingId?: string | null } | undefined;
  return u?.role === "admin" || (u?.role === "couple" && u.weddingId === weddingId);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await params;
  const i = Number(n);
  if (!z.string().uuid().safeParse(id).success || !Number.isInteger(i) || i < 0 || i > 2) return NOPE();
  const [target] = await db.select().from(rishtaProfiles).where(eq(rishtaProfiles.id, id));
  const photo = target?.photos[i];
  if (!target || !photo) return NOPE();

  const viewerId = sessionProfileId((await cookies()).get(RISHTA_COOKIE)?.value);
  const [viewer] = viewerId ? await db.select().from(rishtaProfiles).where(eq(rishtaProfiles.id, viewerId)) : [];
  const allowed = (viewer && (await photoVisibleTo(viewer, target.id))) || (await hostOf(target.weddingId));
  if (!allowed) return NOPE();

  const res = await fetch(photo.url, { cache: "no-store" });
  if (!res.ok || !res.body) return NOPE();
  const type = res.headers.get("content-type") ?? "";
  if (!/^image\/(jpeg|png|webp)$/.test(type)) return NOPE();
  return new Response(res.body, {
    headers: { "Content-Type": type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline", "X-Robots-Tag": "noindex, nofollow" },
  });
}
