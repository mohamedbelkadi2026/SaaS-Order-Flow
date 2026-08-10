// Plain ESM JS — runs with `node script/build.js`, no tsx/esbuild dependency needed.
// Uses Vite for both client and server builds (Vite bundles esbuild internally).
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");

// Packages to BUNDLE into the server output (reduces cold-start openat syscalls).
// Everything else is left external (loaded from node_modules at runtime).
const bundleList = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

// CJS-compat shims — allows bundled deps that call require() / use __dirname to work
// inside the ESM output file.
// Uses dynamic imports + URL to avoid static import name collisions with bundled modules.
const cjsShimBanner = [
  `const require = (await import("module")).createRequire(import.meta.url);`,
  `const __filename = new URL(import.meta.url).pathname;`,
  `const __dirname = __filename.slice(0, __filename.lastIndexOf("/"));`,
].join("\n");

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  // ── 1. Client (frontend) ──────────────────────────────────────────────────
  console.log("building client...");
  await viteBuild();           // uses vite.config.ts (root = client/)

  // ── 2. Server (backend) ──────────────────────────────────────────────────
  console.log("building server...");

  // Build the external-list dynamically from package.json so it stays in sync.
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !bundleList.includes(dep));

  await viteBuild({
    // Don't inherit the root vite.config.ts — that's the client config.
    configFile: false,
    root,
    define: { "process.env.NODE_ENV": '"production"' },
    resolve: {
      alias: {
        "@shared": resolve(root, "shared"),
        "@": resolve(root, "client", "src"),
        "@assets": resolve(root, "attached_assets"),
      },
    },
    ssr: {
      // Packages in bundleList get inlined; everything else stays external.
      noExternal: bundleList,
    },
    build: {
      ssr: "server/index.ts",   // server entry point
      outDir: "dist",
      emptyOutDir: false,        // client assets are already in dist/public
      minify: true,
      rollupOptions: {
        output: {
          format: "esm",
          entryFileNames: "index.js",
          // Inject CJS-compat shims at the top of the bundle.
          banner: cjsShimBanner,
        },
        external: externals,
      },
    },
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
