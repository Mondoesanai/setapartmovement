// Screenshots the site from localhost. Dismisses the entrance overlay and forces every .rv
// reveal on before capturing, so a section that renders fine does not photograph as missing.
//
//   node screenshot.mjs http://localhost:3000 [label] [--w=390] [--h=1400] [--full]
//
// Saves to ./temporary screenshots/screenshot-N[-label].png, auto-incremented.

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const url = args.find((a) => a.startsWith('http')) || 'http://localhost:3000';
const label = args.find((a) => !a.startsWith('http') && !a.startsWith('--')) || '';
const flag = (n, d) => {
  const a = args.find((x) => x.startsWith(`--${n}=`));
  return a ? Number(a.split('=')[1]) : d;
};
const width = flag('w', 390);
const height = flag('h', 1500);
const full = args.includes('--full');

const dir = 'temporary screenshots';
fs.mkdirSync(dir, { recursive: true });
let n = 1;
const used = fs.readdirSync(dir)
  .map((f) => Number((f.match(/^screenshot-(\d+)/) || [])[1]))
  .filter((x) => !Number.isNaN(x));
if (used.length) n = Math.max(...used) + 1;
const out = path.join(dir, `screenshot-${n}${label ? '-' + label : ''}.png`);

const browser = await puppeteer.launch({ headless: 'shell', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width, height, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

// Let the entrance play out rather than capturing through it.
await page.waitForFunction(() => !document.body.classList.contains('locked'), { timeout: 12000 })
  .catch(() => {});
await page.evaluate(() => {
  const i = document.getElementById('intro-light'); if (i) i.remove();
  const j = document.getElementById('intro'); if (j) j.remove();
  document.body.classList.remove('locked');
  document.querySelectorAll('.rv').forEach((el) => el.classList.add('on'));
});
// Scroll the whole page once so anything that reveals on scroll has fired.
await page.evaluate(async () => {
  const step = window.innerHeight * 0.8;
  for (let y = 0; y < document.body.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 60));
  }
  window.scrollTo(0, 0);
});
await new Promise((r) => setTimeout(r, 900));

await page.screenshot({ path: out, fullPage: full });
await browser.close();
console.log(`saved ${out}  (${width}x${height}${full ? ' fullPage' : ''})`);
