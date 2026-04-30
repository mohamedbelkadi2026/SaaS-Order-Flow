#!/usr/bin/env node
/**
 * Generate every favicon / app-icon / share-image size from the SOURCE SVG.
 *
 *   Source of truth: client/public/logo-master.svg
 *
 * Re-run this script any time you tweak the source SVG; it overwrites all
 * downstream PNGs in place. No other file ever needs to be hand-edited.
 *
 *   $ node scripts/generate-favicons.mjs
 *
 * Outputs (all under client/public/):
 *   logo-master.png         1024×1024  transparent
 *   favicon-16x16.png         16×16    transparent
 *   favicon-32x32.png         32×32    transparent
 *   favicon-48x48.png         48×48    transparent
 *   favicon.png              192×192   transparent  (legacy <link rel="icon">)
 *   apple-touch-icon.png     180×180   navy bg      (iOS ignores transparency)
 *   android-chrome-192.png   192×192   transparent
 *   android-chrome-512.png   512×512   transparent
 *   og-image.png            1200×630   navy bg      (WhatsApp / FB / LinkedIn share)
 */

import sharp from "sharp";
import { mkdirSync, readFileSync, statSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

// Anchor every path to the script file (NOT process.cwd()) so the script
// behaves identically whether you run `node scripts/generate-favicons.mjs`
// from the repo root, from inside scripts/, or via an editor task runner.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = resolve(SCRIPT_DIR, "..");
const SRC = join(REPO_ROOT, "client/public/logo-master.svg");
const OUT = join(REPO_ROOT, "client/public");

async function main() {
  mkdirSync(OUT, { recursive: true });

  let svgRaw;
  try {
    svgRaw = readFileSync(SRC);
  } catch (err) {
    throw new Error(
      `Cannot read source SVG at ${SRC}\n` +
      `  ${err?.message ?? err}\n` +
      `  → Make sure client/public/logo-master.svg exists and is readable.`
    );
  }

  // Brand palette — must stay in sync with logo-master.svg.
  const NAVY = { r: 30, g: 27, b: 75, alpha: 1 };
  const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

  // Rasterize the source SVG ONCE at a safe high resolution (2048×2048).
  // Every output size below is a downsample of this single PNG buffer, which
  // (a) sidesteps sharp's per-pipeline pixel-limit and (b) gives sharper small
  // favicons than re-rasterizing the SVG at 16/32/48 directly.
  const MASTER_PX = 2048;
  let masterBuf;
  try {
    masterBuf = await sharp(svgRaw, { density: 144 })
      .resize(MASTER_PX, MASTER_PX, { fit: "contain", background: TRANSPARENT })
      .png()
      .toBuffer();
  } catch (err) {
    throw new Error(
      `Failed to rasterize logo-master.svg — is the SVG well-formed?\n` +
      `  ${err?.message ?? err}`
    );
  }

  const targets = [
    { name: "logo-master.png",        size: 1024, bg: TRANSPARENT },
    { name: "favicon-16x16.png",      size: 16,   bg: TRANSPARENT },
    { name: "favicon-32x32.png",      size: 32,   bg: TRANSPARENT },
    { name: "favicon-48x48.png",      size: 48,   bg: TRANSPARENT },
    { name: "favicon.png",            size: 192,  bg: TRANSPARENT },
    { name: "apple-touch-icon.png",   size: 180,  bg: NAVY },
    { name: "android-chrome-192.png", size: 192,  bg: TRANSPARENT },
    { name: "android-chrome-512.png", size: 512,  bg: TRANSPARENT },
  ];

  let totalBytes = 0;
  for (const { name, size, bg } of targets) {
    const out = safeJoinUnderOut(name);
    await sharp(masterBuf)
      .resize(size, size, { fit: "contain", background: bg })
      .png({ compressionLevel: 9 })
      .toFile(out);
    const bytes = statSync(out).size;
    totalBytes += bytes;
    console.log(`  ✓ ${name.padEnd(26)} ${size}×${size}  ${(bytes / 1024).toFixed(1)} KB`);
  }

  // ── og-image.png ───────────────────────────────────────────────────────────
  // 1200×630 social-share card: icon on the left, wordmark + tagline right.
  const OG_W = 1200;
  const OG_H = 630;

  const iconPx = 360;
  const iconTop = Math.round((OG_H - iconPx) / 2);
  const iconLeft = 96;

  const iconBuf = await sharp(masterBuf)
    .resize(iconPx, iconPx, { fit: "contain", background: TRANSPARENT })
    .png()
    .toBuffer();

  const textSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="280">
      <text x="0" y="130" font-family="Inter, system-ui, sans-serif"
            font-size="112" font-weight="800" fill="#FFFFFF" letter-spacing="-3">Tajergrow</text>
      <text x="0" y="200" font-family="Inter, system-ui, sans-serif"
            font-size="36"  font-weight="500" fill="#C5A059">Gestion e-commerce au Maroc</text>
    </svg>
  `);

  const ogPath = safeJoinUnderOut("og-image.png");
  await sharp({
    create: { width: OG_W, height: OG_H, channels: 4, background: NAVY },
  })
    .composite([
      { input: iconBuf, top: iconTop,      left: iconLeft },
      { input: textSvg, top: iconTop + 50, left: iconLeft + iconPx + 60 },
    ])
    .png({ compressionLevel: 9 })
    .toFile(ogPath);

  const ogBytes = statSync(ogPath).size;
  totalBytes += ogBytes;
  console.log(`  ✓ og-image.png             ${OG_W}×${OG_H}  ${(ogBytes / 1024).toFixed(1)} KB`);

  console.log(`\nDone. ${(totalBytes / 1024).toFixed(1)} KB total across ${targets.length + 1} files.`);
}

/**
 * Defense-in-depth: verify a target filename resolves under OUT before writing.
 * Prevents a malformed filename (e.g. "../../etc/passwd.png") from escaping
 * client/public, even though no input is currently user-controlled.
 */
function safeJoinUnderOut(filename) {
  const full = resolve(OUT, filename);
  if (!full.startsWith(resolve(OUT) + "/") && full !== resolve(OUT)) {
    throw new Error(`Refusing to write outside ${OUT}: ${full}`);
  }
  return full;
}

main().catch((err) => {
  console.error(`\n[generate-favicons] FAILED:\n${err?.message ?? err}`);
  process.exit(1);
});
