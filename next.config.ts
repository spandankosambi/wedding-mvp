import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
