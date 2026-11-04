// Drives the real page against the real /api/release at several clocks, so the automatic flip is
// proven rather than assumed. Needs `node serve.mjs` running.
//
//   node verify-gate.mjs
//
// The flip test runs a second server with a deliberately short expiry (DEV_EXPIRES_IN_MS) and
// watches an already-open tab change state on its own, with no reload.

import puppeteer from 'puppeteer';
import fs from 'fs';
import { spawn } from 'child_process';

const BASE = process.env.BASE || 'http://localhost:3000';
const TOKEN = fs.readFileSync('.preview-token.txt', 'utf8').trim();
const EXPIRES_AT = Date.parse('2026-11-15T02:00:00Z');

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? '  (' + detail + ')' : ''}`);
};

const browser = await puppeteer.launch({ headless: 'shell', args: ['--no-sandbox'] });

async function open(url, { width = 390, height = 844 } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 2 });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  // The entrance holds scroll until it finishes; wait for the page to actually be usable rather
  // than racing it.
  await page.waitForFunction(() => !document.body.classList.contains('locked'), { timeout: 12000 })
    .catch(() => {});
  await new Promise((r) => setTimeout(r, 400));
  return page;
}

async function state(page) {
  return page.evaluate(() => {
    const vis = (el) => !!(el && el.offsetParent !== null);
    const ev = document.getElementById('hero-event');
    const tba = document.getElementById('hero-tba');
    let schemaHasEvent = false;
    try {
      const g = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)['@graph'];
      schemaHasEvent = g.some((n) => n && n['@type'] === 'Event');
    } catch (e) {}
    return {
      gate: window.SAMGate && window.SAMGate.state,
      eventVisible: vis(ev),
      tbaVisible: vis(tba),
      meetupId: window.SAM_CURRENT_MEETUP_ID || null,
      days: (document.getElementById('mt-cd-days') || {}).textContent,
      secs: (document.getElementById('mt-cd-secs') || {}).textContent,
      schemaHasEvent,
      text: (document.getElementById('invite') || document.body).innerText,
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      pending: document.documentElement.classList.contains('sam-gate-pending'),
    };
  });
}

const at = (iso) => `${BASE}/?preview=${encodeURIComponent(TOKEN)}&at=${encodeURIComponent(iso)}`;

// ---------------------------------------------------------------------------
console.log('\n1. the live clock, today — the meetup is announced');
{
  const page = await open(BASE + '/');
  const s = await state(page);
  check('gate answered', !!s.gate, s.gate && s.gate.mode);
  check('answer came from the server, not a fallback', s.gate && s.gate.mode === 'live', s.gate && s.gate.mode);
  check('pending class cleared', !s.pending);
  check('phase is announced', s.gate && s.gate.phase === 'announced');
  check('#hero-event is visible', s.eventVisible);
  check('#hero-tba is not', !s.tbaVisible);
  check('meetup id is 010', s.meetupId === '010', s.meetupId);
  check('countdown shows real days', Number(s.days) > 0 && Number(s.days) < 30, s.days);
  check('Event stays in structured data', s.schemaHasEvent);

  console.log('   visible copy:');
  for (const want of ['CONNECT', 'NOV', '14', 'SAT', '7:00 – 9:00 PM', '2200 Driskell Drive',
                      'Corinth, TX', 'Your Bible', 'A snack to share', 'A friend',
                      'Parents & volunteers welcome', 'Meetup 010']) {
    check(`says "${want}"`, s.text.toLowerCase().includes(want.toLowerCase()));
  }
  for (const no of ['BE THE LIGHT', 'Denton Town Square', 'October 31', 'September 19',
                    'North East Mall', 'July 25', 'You’ve been', 'selected']) {
    check(`does not say "${no}"`, !s.text.toLowerCase().includes(no.toLowerCase()));
  }

  // The countdown must be running, not a static render.
  const a = s.secs;
  await new Promise((r) => setTimeout(r, 1500));
  const b = (await state(page)).secs;
  check('countdown is ticking', a !== b, `${a} -> ${b}`);
  await page.close();
}

// ---------------------------------------------------------------------------
console.log('\n2. the boundary, to the second');
for (const [label, iso, expected] of [
  ['1 hour before expiry', new Date(EXPIRES_AT - 3600000).toISOString(), 'announced'],
  ['1 second before expiry', new Date(EXPIRES_AT - 1000).toISOString(), 'announced'],
  ['exactly at expiry', new Date(EXPIRES_AT).toISOString(), 'past'],
  ['1 second after expiry', new Date(EXPIRES_AT + 1000).toISOString(), 'past'],
  ['the next morning', '2026-11-15T15:00:00Z', 'past'],
]) {
  const page = await open(at(iso));
  const s = await state(page);
  check(`${label} -> ${expected}`, s.gate && s.gate.phase === expected, s.gate && s.gate.phase);
  check(`  ${label}: right hero on screen`,
    expected === 'announced' ? (s.eventVisible && !s.tbaVisible) : (s.tbaVisible && !s.eventVisible),
    `event=${s.eventVisible} tba=${s.tbaVisible}`);
  await page.close();
}

// ---------------------------------------------------------------------------
console.log('\n3. after it expires, the page asks for the waitlist');
{
  const page = await open(at('2026-11-15T15:00:00Z'));
  const s = await state(page);
  check('says the next meetup is not announced', s.text.includes('ISN’T ANNOUNCED YET'));
  check('offers to text them first', s.text.includes('GET TEXTED FIRST'));
  check('no leftover November 14 invitation', !s.text.includes('2200 Driskell Drive'));
  check('no stale countdown', !s.text.includes('7:00 – 9:00 PM'));
  check('Event removed from structured data', !s.schemaHasEvent);
  check('no meetup id, so nothing can RSVP to a finished event', s.meetupId === null, s.meetupId);
  check('waitlist card cannot be dismissed away', !s.text.includes('×'));
  await page.close();
}

// ---------------------------------------------------------------------------
console.log('\n4. the test clock is not a public backdoor');
{
  const page = await open(`${BASE}/?at=2026-12-25T00:00:00Z`);
  const s = await state(page);
  check('?at= without the token is ignored', s.gate && s.gate.phase === 'announced', s.gate && s.gate.phase);
  check('  and the real meetup still shows', s.eventVisible);
  await page.close();
}
{
  const page = await open(`${BASE}/?preview=wrong-token&at=2026-12-25T00:00:00Z`);
  const s = await state(page);
  check('a wrong token is ignored too', s.gate && s.gate.phase === 'announced', s.gate && s.gate.phase);
  await page.close();
}

// ---------------------------------------------------------------------------
console.log('\n5. a tab that is already open flips by itself');
{
  const PORT = 3099;
  const child = spawn(process.execPath, ['serve.mjs'], {
    env: { ...process.env, PORT: String(PORT), DEV_EXPIRES_IN_MS: '9000' },
    stdio: 'ignore',
  });
  await new Promise((r) => setTimeout(r, 1200));
  try {
    const page = await open(`http://localhost:${PORT}/`);
    const before = await state(page);
    check('opens on the announced meetup', before.eventVisible && !before.tbaVisible,
      `event=${before.eventVisible} tba=${before.tbaVisible}`);
    const url1 = page.url();

    // No reload, no interaction — just wait past the expiry the server reported.
    await page.waitForFunction(
      () => { const t = document.getElementById('hero-tba'); return !!(t && t.offsetParent !== null); },
      { timeout: 20000 },
    ).then(() => check('flipped to the waitlist on its own', true))
     .catch(() => check('flipped to the waitlist on its own', false, 'timed out after 20s'));

    const after = await state(page);
    check('  announced hero is gone', !after.eventVisible);
    check('  url never changed (no reload)', page.url() === url1);
    await new Promise((r) => setTimeout(r, 1600));
    check('  countdown stopped ticking', (await state(page)).secs === after.secs, after.secs);
    await page.close();
  } finally {
    child.kill();
  }
}

// ---------------------------------------------------------------------------
console.log('\n6. no sideways scroll at any width, in either phase');
for (const w of [320, 390, 430, 768, 1024, 1280]) {
  for (const [label, url] of [['announced', BASE + '/'], ['waitlist', at('2026-11-15T15:00:00Z')]]) {
    const page = await open(url, { width: w, height: 900 });
    const s = await state(page);
    check(`${w}px ${label}: scrollWidth ${s.scrollW} <= clientWidth ${s.clientW}`, s.scrollW <= s.clientW);
    await page.close();
  }
}

// ---------------------------------------------------------------------------
console.log('\n7. RSVP still opens the name-and-number form');
{
  const page = await open(BASE + '/');
  await page.evaluate(() => document.getElementById('mt-rsvp-btn').scrollIntoView({ block: 'center' }));
  await new Promise((r) => setTimeout(r, 300));
  const box = await page.evaluate(() => {
    const r = document.getElementById('mt-rsvp-btn').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(box.x, box.y); // a real click, so a covering overlay would block it
  await new Promise((r) => setTimeout(r, 600));
  const modal = await page.evaluate(() => {
    const m = document.getElementById('wl-modal');
    const txt = document.body.innerText;
    return { found: !!m, visible: !!(m && m.classList.contains('open')), hasName: /name/i.test(txt), hasPhone: /number|phone/i.test(txt) };
  });
  check('RSVP opens a modal', modal.visible, JSON.stringify(modal));
  check('  it asks for a name and a number', modal.hasName && modal.hasPhone);
  await page.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
