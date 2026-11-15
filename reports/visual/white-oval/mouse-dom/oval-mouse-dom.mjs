
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const OUT = path.resolve('tmp/oval-mouse-dom');
const URL = 'http://127.0.0.1:4321/?district=kaohsiung-council-04&admin=E03&candidate=kaohsiung-council-04-16f09b7e';
await fs.mkdir(path.join(OUT, 'screens'), { recursive: true });
await fs.mkdir(path.join(OUT, 'video'), { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const context = await browser.newContext({
  viewport: { width: 1512, height: 982 },
  deviceScaleFactor: 1,
  reducedMotion: 'no-preference',
  recordVideo: { dir: path.join(OUT, 'video'), size: { width: 1512, height: 982 } },
});
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__kaohsiungWorld?.camera), null, { timeout: 30000 });
await page.waitForTimeout(7000);

await page.evaluate(() => {
  window.__ovalMutations = [];
  window.__ovalMutationCount = 0;
  const describe = (node, removed) => {
    if (!node || node.nodeType !== 1) return null;
    const el = node;
    const rect = removed ? null : el.getBoundingClientRect();
    const area = rect ? Math.round(rect.width * rect.height) : 0;
    if (!removed && area < 10000) return null;
    const cs = removed ? null : getComputedStyle(el);
    return {
      tag: el.tagName,
      id: el.id || '',
      className: typeof el.className === 'string' ? el.className.slice(0, 180) : '',
      area,
      rect: rect ? { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) } : null,
      background: cs?.backgroundColor || '',
      borderRadius: cs?.borderRadius || '',
      opacity: cs?.opacity || '',
      text: (el.textContent || '').trim().slice(0, 80),
      removed: Boolean(removed),
    };
  };
  const observer = new MutationObserver((records) => {
    window.__ovalMutationCount += records.length;
    for (const record of records) {
      for (const node of record.addedNodes) {
        const item = describe(node, false);
        if (item) window.__ovalMutations.push(item);
      }
      for (const node of record.removedNodes) {
        const item = describe(node, true);
        if (item) window.__ovalMutations.push(item);
      }
    }
    if (window.__ovalMutations.length > 300) window.__ovalMutations.splice(0, window.__ovalMutations.length - 300);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.__ovalObserver = observer;

  const parseColor = (value) => {
    const m = String(value).match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)/);
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  };
  const neutral = (c) => {
    if (!c || c.a < 0.25) return false;
    const max = Math.max(c.r, c.g, c.b);
    const min = Math.min(c.r, c.g, c.b);
    return max - min <= 8 && max >= 175;
  };
  window.__ovalScan = () => {
    const found = [];
    for (const el of document.querySelectorAll('body *')) {
      const rect = el.getBoundingClientRect();
      const area = Math.round(rect.width * rect.height);
      if (area < 12000 || rect.width < 60 || rect.height < 60) continue;
      const cs = getComputedStyle(el);
      const bg = parseColor(cs.backgroundColor);
      const opacity = Number(cs.opacity);
      if (neutral(bg) && opacity > 0.05) {
        found.push({
          tag: el.tagName,
          id: el.id || '',
          className: typeof el.className === 'string' ? el.className.slice(0, 140) : '',
          area,
          rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
          background: cs.backgroundColor,
          borderRadius: cs.borderRadius,
          opacity: cs.opacity,
          text: (el.textContent || '').trim().slice(0, 60),
        });
      }
      for (const pseudo of ['::before', '::after']) {
        const pcs = getComputedStyle(el, pseudo);
        if (pcs.content === 'none' || pcs.content === 'normal') continue;
        const pbg = parseColor(pcs.backgroundColor);
        if (neutral(pbg)) {
          found.push({
            tag: el.tagName + pseudo,
            id: el.id || '',
            className: typeof el.className === 'string' ? el.className.slice(0, 140) : '',
            area,
            rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
            background: pcs.backgroundColor,
            borderRadius: pcs.borderRadius,
            opacity: pcs.opacity,
            text: (el.textContent || '').trim().slice(0, 60),
          });
        }
      }
    }
    return found.sort((a, b) => b.area - a.area).slice(0, 20);
  };
});

const results = { url: URL, steps: [], screenshots: [], consoleErrors };
let stepIndex = 0;
async function step(name, action) {
  if (action) await action();
  await page.waitForTimeout(450);
  const shotName = String(stepIndex).padStart(2, '0') + '-' + name;
  const shotPath = path.join(OUT, 'screens', shotName + '.png');
  await page.screenshot({ path: shotPath, fullPage: false });
  const data = await page.evaluate(() => {
    const profile = document.querySelector('.profile-panel');
    let profileVisible = false;
    if (profile) {
      const r = profile.getBoundingClientRect();
      const cs = getComputedStyle(profile);
      profileVisible = r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden';
    }
    return {
      camera: window.__kaohsiungWorld?.camera?.() || null,
      heroVisible: window.__kaohsiungWorld?.heroVisible?.() ?? null,
      mutationCount: window.__ovalMutationCount,
      mutations: window.__ovalMutations.splice(0, window.__ovalMutations.length),
      largeNeutral: window.__ovalScan(),
      profileVisible,
      tagCount: document.querySelectorAll('.actor-name-tag').length,
    };
  });
  results.steps.push({ name, screenshot: path.relative(process.cwd(), shotPath), ...data });
  results.screenshots.push(path.relative(process.cwd(), shotPath));
  console.log(JSON.stringify({ step: name, mutations: data.mutations.length, largeNeutral: data.largeNeutral.length, profileVisible: data.profileVisible, camera: data.camera, heroVisible: data.heroVisible }));
  stepIndex += 1;
}

const tag = page.locator('.actor-name-tag').first();
const tagBox = await tag.boundingBox().catch(() => null);

await step('start-profile-open');
if (tagBox) {
  await step('hover-candidate-tag', async () => {
    await page.mouse.move(tagBox.x + tagBox.width / 2, tagBox.y + tagBox.height / 2, { steps: 4 });
    await page.waitForTimeout(500);
  });
} else {
  results.steps.push({ name: 'candidate-tag-missing' });
}

await step('hover-grid-with-profile-open', async () => {
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 8; col++) {
      await page.mouse.move(140 + col * 125, 150 + row * 135, { steps: 2 });
      await page.waitForTimeout(45);
    }
  }
});

await step('pan-drag-with-profile-open', async () => {
  await page.mouse.move(760, 540);
  await page.mouse.down();
  await page.mouse.move(500, 540, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(600);
});

await step('wheel-zoom-with-profile-open', async () => {
  await page.mouse.move(700, 500);
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(700);
});

const close = page.locator('.profile-panel__close').first();
if (await close.isVisible().catch(() => false)) {
  await step('close-profile', async () => {
    await close.click();
    await page.waitForTimeout(800);
  });
} else {
  results.steps.push({ name: 'profile-close-button-missing' });
}

const search = page.locator('#candidate-search');
if (await search.isVisible().catch(() => false)) {
  await step('reopen-profile-via-search', async () => {
    await search.click();
    await search.fill('陳冠宇');
    await page.waitForTimeout(700);
    const result = page.locator('button', { hasText: '陳冠宇' }).first();
    if (await result.isVisible().catch(() => false)) {
      await result.click();
      await page.waitForTimeout(1200);
    }
  });
} else {
  results.steps.push({ name: 'candidate-search-missing' });
}

await step('click-map-while-profile-open', async () => {
  await page.mouse.click(620, 610);
  await page.waitForTimeout(800);
});

const close2 = page.locator('.profile-panel__close').first();
if (await close2.isVisible().catch(() => false)) {
  await step('close-profile-after-map-click', async () => {
    await close2.click();
    await page.waitForTimeout(800);
  });
} else {
  results.steps.push({ name: 'profile-close-button-missing-2' });
}

const nanzih = page.getByRole('button', { name: '楠梓', exact: true }).first();
if (await nanzih.isVisible().catch(() => false)) {
  await step('switch-nanzih', async () => {
    await nanzih.click();
    await page.waitForTimeout(1800);
  });
} else {
  results.steps.push({ name: 'nanzih-button-missing' });
}

const zuoying = page.getByRole('button', { name: '左營', exact: true }).first();
if (await zuoying.isVisible().catch(() => false)) {
  await step('switch-zuoying', async () => {
    await zuoying.click();
    await page.waitForTimeout(1800);
  });
} else {
  results.steps.push({ name: 'zuoying-button-missing' });
}

await page.waitForTimeout(500);

const pixelStats = [];
for (const file of results.screenshots) {
  const abs = path.resolve(file);
  const { data, info } = await sharp(abs).raw().toBuffer({ resolveWithObject: true });
  let count = 0;
  let minX = info.width, minY = info.height, maxX = 0, maxY = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (Math.abs(r - 222) <= 3 && Math.abs(g - 222) <= 3 && Math.abs(b - 222) <= 3) {
        count++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  pixelStats.push({ file, nearDEDEDE: count, bbox: count ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null });
}
results.pixelStats = pixelStats;
results.video = path.relative(process.cwd(), path.join(OUT, 'walkthrough.webm'));
await fs.writeFile(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
console.log('RESULT ' + JSON.stringify({ steps: results.steps.length, screenshots: results.screenshots.length, consoleErrors: consoleErrors.length, video: results.video }));

const video = page.video();
await page.close();
if (video) {
  try { await video.saveAs(path.join(OUT, 'walkthrough.webm')); } catch (error) { console.log('VIDEO_SAVE_FAILED ' + error.message); }
}
await context.close();
await browser.close();
