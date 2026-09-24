/**
 * Browser verification against a running dev server (npm run dev).
 *
 *   npm run verify:ui
 *
 * Covers the task flows end to end plus the reminder UI. Pure logic lives in
 * `npm test`; this is the part that needs a real DOM. Skips cleanly when no
 * Chromium is available, so it never breaks a machine without one.
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, access } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEV_URL = process.env.VERIFY_URL || 'http://127.0.0.1:5173/';
const CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

try {
  await access(CHROMIUM);
} catch {
  console.log(`No Chromium at ${CHROMIUM} — skipping UI verification.`);
  console.log('Set CHROMIUM_PATH to run it.');
  process.exit(0);
}

// Serve the built APK asset dir the way Capacitor's WebViewAssetLoader does:
// from an origin root over http, never file://.
const APK_DIR = join(ROOT, 'android/app/src/main/assets/public');
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
const server = createServer(async (req, res) => {
  const path = (req.url || '/').split('?')[0];
  const rel = path === '/' ? '/index.html' : path;
  try {
    const body = await readFile(join(APK_DIR, rel));
    res.writeHead(200, { 'Content-Type': MIME[extname(rel)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const APK_ORIGIN = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({ executablePath: CHROMIUM });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(DEV_URL, { waitUntil: 'networkidle' });

const groupOf = (title) =>
  page.evaluate((t) => {
    for (const g of document.querySelectorAll('.group')) {
      const label = g.querySelector('.group__label')?.textContent?.trim();
      for (const item of g.querySelectorAll('.task__title')) {
        if (item.textContent.trim() === t) return label;
      }
    }
    return null;
  }, title);

const quickAdd = (text) => page.locator('.quick-add__input');
async function add(text) {
  await quickAdd().fill(text);
  await quickAdd().press('Enter');
  await page.waitForTimeout(200);
}

// ---------- core task flows ----------
check('app boots', (await page.locator('h1').innerText()).includes('Today'));
check('seed tasks render', (await page.locator('.task').count()) > 0);

await quickAdd().fill('Buy milk tomorrow !high');
check('preview strips parsed tokens',
  (await page.locator('.quick-add__preview-title').innerText()) === 'Buy milk');
await quickAdd().press('Enter');
await page.waitForTimeout(200);

await page.locator('.nav-item', { hasText: 'All tasks' }).click();
await page.waitForTimeout(200);
check('title is exactly "Buy milk"',
  (await page.locator('.task__title', { hasText: /^Buy milk$/ }).count()) === 1);
check('lands under Tomorrow', (await groupOf('Buy milk')) === 'Tomorrow');
const milk = page.locator('.task', { hasText: 'Buy milk' }).first();
check('high priority dot', (await milk.locator('.priority-dot--high').count()) === 1);
check('no reminder from a bare date', (await milk.locator('.chip--reminder').count()) === 0);

await add('Sort out the loft');
check('undated task lands in Someday', (await groupOf('Sort out the loft')) === 'Someday');

await add('Send invoice friday #work !med');
const invoice = page.locator('.task', { hasText: 'Send invoice' }).first();
check('#work routes to the Work list',
  (await invoice.locator('.chip--list').innerText()).includes('Work'));

// complete / uncomplete
await milk.locator('.checkbox').click();
await page.waitForTimeout(600);
check('checked task leaves its bucket', (await groupOf('Buy milk')) !== 'Tomorrow');
await page.locator('.group__header--button', { hasText: 'Completed' }).click();
await page.waitForTimeout(150);
check('appears under Completed', (await groupOf('Buy milk')) === 'Completed');
await page.locator('.task', { hasText: 'Buy milk' }).first().locator('.checkbox').click();
await page.waitForTimeout(600);
check('unchecking restores it', (await groupOf('Buy milk')) === 'Tomorrow');

// ---------- reminders: quick add ----------
await add('Call the dentist tomorrow at 9am');
const dentist = page.locator('.task', { hasText: 'Call the dentist' }).first();
check('quick-add time yields a reminder chip',
  (await dentist.locator('.chip--reminder').count()) === 1);
check('reminder chip shows 09:00',
  (await dentist.locator('.chip--reminder').innerText()).includes('09:00'),
  await dentist.locator('.chip--reminder').innerText());
check('time words stripped from the title',
  (await page.locator('.task__title', { hasText: /^Call the dentist$/ }).count()) === 1);

await add('Team sync every monday at 10am');
const sync = page.locator('.task', { hasText: 'Team sync' }).first();
const syncChip = await sync.locator('.chip--reminder').innerText();
check('repeating reminder shows a repeat glyph', syncChip.includes('↻'), syncChip);
check('repeating reminder shows 10:00', syncChip.includes('10:00'), syncChip);

// ---------- reminders: detail drawer ----------
await page.locator('.task', { hasText: 'Sort out the loft' }).first().locator('.task__body').click();
await page.waitForSelector('.detail');
check('reminder section present',
  (await page.locator('.detail__label', { hasText: 'Reminder' }).count()) === 1);
check('no datetime value before one is set',
  (await page.locator('input[aria-label="Reminder time"]').inputValue()) === '');
check('repeat select hidden until a reminder exists',
  (await page.locator('select[aria-label="Repeat"]').count()) === 0);
check('web build explains reminders are Android-only',
  (await page.locator('.detail__hint', { hasText: /Android app/ }).count()) === 1);

await page.locator('.pill', { hasText: 'Tomorrow 9am' }).click();
await page.waitForTimeout(250);
const dtValue = await page.locator('input[aria-label="Reminder time"]').inputValue();
check('quick pill fills the datetime input', /T09:00$/.test(dtValue), dtValue);
check('repeat select appears once set',
  (await page.locator('select[aria-label="Repeat"]').count()) === 1);

await page.locator('select[aria-label="Repeat"]').selectOption('week');
await page.waitForTimeout(200);
check('repeat selection round-trips',
  (await page.locator('select[aria-label="Repeat"]').inputValue()) === 'week');

const loftChip = page.locator('.task', { hasText: 'Sort out the loft' }).first().locator('.chip--reminder');
check('setting a reminder moves it out of Someday',
  (await groupOf('Sort out the loft')) !== 'Someday', `${await groupOf('Sort out the loft')}`);
check('row chip reflects the repeat', (await loftChip.innerText()).includes('↻'));

// ---------- persistence ----------
await page.keyboard.press('Escape');
await page.reload({ waitUntil: 'networkidle' });
await page.locator('.nav-item', { hasText: 'All tasks' }).click();
await page.waitForTimeout(250);
check('reminders survive a reload',
  (await page.locator('.task', { hasText: 'Sort out the loft' }).first()
    .locator('.chip--reminder').count()) === 1);
await page.locator('.task', { hasText: 'Sort out the loft' }).first().locator('.task__body').click();
await page.waitForSelector('.detail');
check('repeat survives a reload',
  (await page.locator('select[aria-label="Repeat"]').inputValue()) === 'week');

// clearing
await page.locator('.pill', { hasText: 'Clear' }).click();
await page.waitForTimeout(200);
check('Clear removes the reminder',
  (await page.locator('input[aria-label="Reminder time"]').inputValue()) === '');
await page.keyboard.press('Escape');

// ---------- migration from pre-reminder storage ----------
// The exact shape a v1 build wrote, with no `reminder` key anywhere.
const legacy = {
  lists: [{ id: 'list-personal', name: 'Personal', color: '#3d7bfb' }],
  tasks: [
    {
      id: 'legacy-1',
      title: 'Written by the old build',
      notes: 'kept',
      done: false,
      dueDate: null,
      priority: 'high',
      listId: 'list-personal',
      subtasks: [{ id: 's1', title: 'sub', done: true }],
      createdAt: '2026-01-01T00:00:00.000Z',
      completedAt: null,
    },
  ],
};
// A fresh context, seeded before the app boots: the running page flushes its own
// state on pagehide, which would clobber anything injected into the live tab.
const legacyCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const legacyPage = await legacyCtx.newPage();
const legacyErrors = [];
legacyPage.on('pageerror', (e) => legacyErrors.push(String(e)));
await legacyPage.addInitScript((state) => {
  localStorage.setItem('todo:v1:state', JSON.stringify(state));
}, legacy);
await legacyPage.goto(DEV_URL, { waitUntil: 'networkidle' });
await legacyPage.locator('.nav-item', { hasText: 'All tasks' }).click();
await legacyPage.waitForTimeout(300);
check('pre-reminder data still loads',
  (await legacyPage.locator('.task__title', { hasText: 'Written by the old build' }).count()) === 1);
const legacyRow = legacyPage.locator('.task', { hasText: 'Written by the old build' }).first();
check('old task survives with no reminder chip',
  (await legacyRow.locator('.chip--reminder').count()) === 0);
check('old fields preserved through migration',
  (await legacyRow.locator('.priority-dot--high').count()) === 1);
check('old subtasks preserved',
  (await legacyRow.locator('.chip--quiet').first().innerText()).includes('1/1'));
check('migration produces no errors', legacyErrors.length === 0, legacyErrors.slice(0, 2).join(' | '));

await legacyRow.locator('.task__body').click();
await legacyPage.waitForSelector('.detail');
check('migrated task starts with no reminder',
  (await legacyPage.locator('input[aria-label="Reminder time"]').inputValue()) === '');
await legacyPage.locator('.pill', { hasText: 'Tonight 8pm' }).click();
await legacyPage.waitForTimeout(250);
check('migrated task accepts a reminder',
  /T20:00$/.test(await legacyPage.locator('input[aria-label="Reminder time"]').inputValue()));
await legacyCtx.close();

check('no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));

// ---------- the bundle that ships in the APK ----------
const apkCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const apkPage = await apkCtx.newPage();
const apkErrors = [];
apkPage.on('pageerror', (e) => apkErrors.push(String(e)));
apkPage.on('console', (m) => m.type() === 'error' && apkErrors.push(m.text()));
await apkPage.goto(APK_ORIGIN, { waitUntil: 'load' });
await apkPage.waitForTimeout(800);
check('packaged assets boot', (await apkPage.locator('.task').count()) > 0);
check('packaged assets load without errors', apkErrors.length === 0,
  apkErrors.slice(0, 2).join(' | '));
await apkPage.locator('.quick-add__input').fill('Packaged reminder at 7pm');
await apkPage.locator('.quick-add__input').press('Enter');
await apkPage.waitForTimeout(300);
await apkPage.reload({ waitUntil: 'load' });
await apkPage.waitForTimeout(600);
check('reminder persists in the packaged build',
  (await apkPage.locator('.task', { hasText: 'Packaged reminder' }).first()
    .locator('.chip--reminder').count()) === 1);

// ---------- responsive ----------
const mob = await browser.newContext({
  viewport: { width: 375, height: 780 },
  hasTouch: true,
  isMobile: true,
});
const mp = await mob.newPage();
await mp.goto(DEV_URL, { waitUntil: 'networkidle' });
await mp.waitForTimeout(400);
check('no horizontal overflow at 375px',
  (await mp.evaluate(() => document.documentElement.scrollWidth)) <= 375);
check('row actions reachable without hover',
  (await mp.locator('.task').first().locator('.task__delete')
    .evaluate((el) => getComputedStyle(el).opacity)) === '1');

await browser.close();
server.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('failed: ' + failed.map((f) => f.name).join(', '));
  process.exit(1);
}
