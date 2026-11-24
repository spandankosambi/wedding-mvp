"use server";
import { headers } from "next/headers";
import { visitorIp } from "@/lib/auth/ratelimit";
import { submitOpenRsvp, type OpenRsvpInput } from "@/lib/guests/open-rsvp";

export async function submitOpenRsvpAction(input: OpenRsvpInput) {
  const h = await headers();
  const ip = visitorIp(h);
  return submitOpenRsvp(input, ip);
}
