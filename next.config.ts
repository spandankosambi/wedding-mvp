import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/* Where the browser may load things from. Photos and music live in Vercel
   Blob; fonts are self-hosted by next/font; the print preview runs pdf.js in a
   worker. Inline scripts/styles stay allowed because Next and the themes use
   them (a nonce-based policy would force every page to render per request). */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""} https://vercel.live`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://*.public.blob.vercel-storage.com https://vercel.live https://vercel.com",
  "media-src 'self' blob: https://*.public.blob.vercel-storage.com",
  "font-src 'self' data: https://vercel.live",
  `connect-src 'self' https://*.public.blob.vercel-storage.com https://vercel.live wss://ws-us3.pusher.com${isDev ? " ws: http://localhost:*" : ""}`,
  "worker-src 'self' blob:",
  "frame-src 'self' https://vercel.live",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // always https, for two years, on every subdomain too
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // no one may show our pages inside their own (clickjacking)
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // other sites see only "onetapinvites.com", never a private invite link
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  poweredByHeader: false,
  // PGlite ships WASM assets that must load from node_modules, not the bundle
  serverExternalPackages: ["@electric-sql/pglite"],
  // the printed-card fonts are read from disk when the PDF is made
  outputFileTracingIncludes: {
    "/couple/invitation": ["./src/lib/invitation/fonts/**/*"],
  },
  experimental: {
    // Guest-list uploads, phone photos of handwritten lists, and the parsed sheet
    // round-tripping through the import wizard
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
