/**
 * Renders resources/icon.png (and icon-foreground/background for adaptive icons)
 * from the same blue check mark used as the web favicon, so the installed app
 * and the browser tab share one mark.
 *
 * Run with: npm run icon
 * Then regenerate the Android density set with: npx capacitor-assets generate --android
 */
// playwright-core (not playwright) so `npm ci` never downloads a browser —
// this script points at an existing Chromium instead.
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'resources');
const SIZE = 1024;
const ACCENT = '#3d7bfb';

const check = (stroke, width) =>
  `<polyline points="288,528 432,672 736,352" fill="none" stroke="${stroke}"
     stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" />`;

// Full icon: rounded square, Android/iOS style.
const icon = `
  <rect width="1024" height="1024" rx="224" fill="${ACCENT}" />
  ${check('#ffffff', 96)}
`;

// Adaptive icons: Android masks the foreground and can shift it, so the mark
// sits inside the safe centre ~66% and the background is a flat colour.
const foreground = `
  <g transform="translate(512,512) scale(0.62) translate(-512,-512)">
    ${check('#ffffff', 108)}
  </g>
`;

const background = `<rect width="1024" height="1024" fill="${ACCENT}" />`;

const page = (body) => `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:transparent}
  svg{display:block}
</style></head>
<body><svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"
  viewBox="0 0 1024 1024">${body}</svg></body></html>`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
});

try {
  await mkdir(OUT, { recursive: true });
  const tab = await browser.newPage({
    viewport: { width: SIZE, height: SIZE },
    deviceScaleFactor: 1,
  });

  for (const [name, body, transparent] of [
    ['icon.png', icon, false],
    ['icon-foreground.png', foreground, true],
    ['icon-background.png', background, false],
  ]) {
    await tab.setContent(page(body));
    await tab.screenshot({
      path: join(OUT, name),
      omitBackground: transparent,
    });
    console.log(`wrote resources/${name}`);
  }
} finally {
  await browser.close();
}
