import { NextResponse, type NextRequest } from "next/server";

/** The site's first address. Links already shared on it now lead to the main domain. */
const OLD_HOSTS = new Set(["wedding-mvp-uat.vercel.app"]);
const MAIN_ORIGIN = "https://onetapinvites.com";
const SIGNED_IN_ONLY = /^\/(couple|committee|admin)(\/|$)/;

export function proxy(req: NextRequest) {
  // 1. the old address: the same page on the new one (permanent, keeps path and query)
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").toLowerCase();
  if (OLD_HOSTS.has(host)) {
    return NextResponse.redirect(new URL(req.nextUrl.pathname + req.nextUrl.search, MAIN_ORIGIN), 308);
  }
  // 2. Coarse gate only: bounce visitors with no session cookie to /signin.
  // Role + wedding-ownership enforcement lives in requireRole inside every page/action —
  // this never imports the auth module (database sessions can't be validated here anyway).
  if (SIGNED_IN_ONLY.test(req.nextUrl.pathname)) {
    const hasSession =
      req.cookies.has("authjs.session-token") ||
      req.cookies.has("__Secure-authjs.session-token");
    if (!hasSession) return NextResponse.redirect(new URL("/signin", req.url));
  }
  return NextResponse.next();
}

// every page (not build assets or images), so the old address redirects wherever a link points
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)"] };
