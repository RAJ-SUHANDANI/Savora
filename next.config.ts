import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Menu photography is served from Unsplash in the seed data. Allowing the host
   * here means `next/image` optimises and lazily loads those images instead of
   * the browser pulling full-resolution originals.
   */
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
    ],
  },

  /**
   * PGlite is PostgreSQL compiled to WebAssembly. It resolves its own
   * `.wasm` and `.data` files relative to the module at runtime, which a
   * bundler cannot follow — so it has to stay a real `require()` from
   * `node_modules` rather than being inlined into the server bundle.
   *
   * It is listed unconditionally rather than only in demo mode because the
   * import is static: `src/lib/db.ts` needs the pool handle synchronously, and
   * the check that decides whether to use it is a runtime environment variable.
   * The WebAssembly itself is only fetched when demo mode is actually on.
   */
  serverExternalPackages: ["@electric-sql/pglite"],

  /**
   * Demo mode applies the migrations by reading them from disk, so the SQL has
   * to survive into the build output. Next.js only traces files it can see
   * referenced through a static import; these are opened with a computed path,
   * so without this they are silently dropped and the deploy fails on its first
   * query with "could not read prisma/migrations/...".
   */
  outputFileTracingIncludes: {
    "/*": ["./prisma/migrations/**/*.sql"],
  },
};

export default nextConfig;
