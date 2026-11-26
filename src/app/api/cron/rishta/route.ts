import { env } from "@/config/env";
import { purgeClosed } from "@/lib/rishta/host";

/*
 * The daily backstop for Rishta Corner's deletion promise (pages also run it
 * hourly as they're visited). Vercel Cron calls this with CRON_SECRET; with
 * no secret set it refuses.
 */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = env.cronSecret;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  return Response.json(await purgeClosed());
}
