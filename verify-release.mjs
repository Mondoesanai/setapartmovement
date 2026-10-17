// Verification for the BE THE LIGHT scheduled release.
// Drives /api/release from the test side so the gate can be proven immediately before, exactly
// at, and immediately after the deadline, plus the already-open-tab flip, without waiting a day.

import puppeteer from 'puppeteer';
import fs from 'fs';

const CHROME = [
  'C:/Users/nateh/.cache/puppeteer/chrome/win64-131.0.6778.85/chrome-win64/chrome.exe',
  'C:/Users/mondo/.cache/puppeteer/chrome/win64-131.0.6778.85/chrome-win64/chrome.exe',
].find((p) => fs.existsSync(p));

const BASE = process.env.BASE || 'http://localhost:3410';
const RELEASE_AT = Date.parse('2026-10-18T01:00:00Z');

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? '  (' + detail + ')' : ''}`);
};

const browser = await puppeteer.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });

// Opens the page with /api/release answered from a script-controlled clock.
async function open({ width = 390, height = 844, nowAt, reduced = false, onResponse } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: width < 700, hasTouch: width < 700 });
  if (reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let serverNow = typeof nowAt === 'string' ? Date.parse(nowAt) : nowAt;
  let calls = 0;
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    if (r.url().includes('/api/release')) {
      calls++;
      if (onResponse) serverNow = onResponse(calls, serverNow);
      return r.respond({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({
          released: serverNow >= RELEASE_AT,
          mode: 'test-clock',
          now: serverNow,
          releaseAt: RELEASE_AT,
        }),
      });
    }
    if (r.url().includes('/api/join')) {
      return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, isNew: true }) });
    }
    r.continue();
  });
  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  return { page, errors, calls: () => calls };
}

const state = (page) => page.evaluate(() => {
  const legacy = document.getElementById('hero-legacy');
  const bl = document.getElementById('hero-belight');
  const vis = (el) => !!(el && !el.hidden && el.offsetParent !== null);
  return {
    legacyVisible: vis(legacy),
    belightVisible: vis(bl),
    gateMode: window.SAMGate && window.SAMGate.state ? window.SAMGate.state.mode : null,
    gateReleased: window.SAMGate && window.SAMGate.state ? window.SAMGate.state.released : null,
    meetupId: window.SAM_CURRENT_MEETUP_ID || null,
    locked: document.body.classList.contains('locked'),
    cardIntroPresent: !!document.getElementById('intro'),
    lightIntroPresent: !!document.getElementById('intro-light'),
    headline: (document.querySelector('.bl-headline') || {}).textContent || '',
    countdownDays: (document.getElementById('bl-cd-days') || {}).textContent || '',
    overflow: document.documentElement.scrollWidth > window.innerWidth,
  };
});

console.log('\n=== 1. BEFORE RELEASE (the current public site must be untouched) ===');
{
  const { page, errors } = await open({ nowAt: '2026-10-17T20:00:00Z' });
  await new Promise((r) => setTimeout(r, 3000));
  const st = await state(page);
  check('Oct 17 hero is the one showing', st.legacyVisible, 'legacy=' + st.legacyVisible);
  check('BE THE LIGHT is not visible', !st.belightVisible);
  check('card entrance still present', st.cardIntroPresent);
  check('meetup id is still 008', st.meetupId === '008', st.meetupId);
  const leaked = await page.evaluate(() => {
    const bl = document.getElementById('hero-belight');
    return bl ? bl.getBoundingClientRect().height : -1;
  });
  check('new event occupies no space pre-release', leaked === 0, 'height=' + leaked);
  check('no JS errors', errors.length === 0, errors.join('|'));
  await page.close();
}

console.log('\n=== 2. THE BOUNDARY (1s before / exactly at / 1s after) ===');
for (const [label, iso, expectReleased] of [
  ['T-1s  2026-10-18T00:59:59Z', '2026-10-18T00:59:59Z', false],
  ['T     2026-10-18T01:00:00Z', '2026-10-18T01:00:00Z', true],
  ['T+1s  2026-10-18T01:00:01Z', '2026-10-18T01:00:01Z', true],
]) {
  const { page, errors } = await open({ nowAt: iso });
  await new Promise((r) => setTimeout(r, 3200));
  const st = await state(page);
  check(label, st.belightVisible === expectReleased && st.legacyVisible === !expectReleased,
    `belight=${st.belightVisible} legacy=${st.legacyVisible}`);
  check('   no JS errors', errors.length === 0, errors.join('|'));
  await page.close();
}

console.log('\n=== 3. AFTER RELEASE (new version, fresh visitor) ===');
{
  const { page, errors } = await open({ nowAt: '2026-10-18T02:00:00Z' });
  await new Promise((r) => setTimeout(r, 3600));
  const st = await state(page);
  check('BE THE LIGHT is showing', st.belightVisible);
  check('Oct 17 hero is gone', !st.legacyVisible);
  check('headline reads BE THE LIGHT', /BE THE\s*LIGHT/i.test(st.headline.replace(/\s+/g, ' ')), JSON.stringify(st.headline));
  check('card entrance removed', !st.cardIntroPresent);
  check('page is unlocked (entrance finished)', !st.locked);
  check('new RSVPs route to meetup 009', st.meetupId === '009', st.meetupId);
  check('countdown is counting to Oct 31', /^\d+$/.test(st.countdownDays) && Number(st.countdownDays) === 13,
    st.countdownDays + ' days from Oct 18');
  check('no horizontal overflow', !st.overflow);
  check('no JS errors', errors.length === 0, errors.join('|'));
  await page.close();
}

console.log('\n=== 4. ALREADY-OPEN TAB CROSSES 8PM (no refresh, no form) ===');
{
  // First answer: 2s before release. The page schedules its own flip from the server clock.
  const { page, errors } = await open({
    nowAt: RELEASE_AT - 2000,
    onResponse: (n) => (n === 1 ? RELEASE_AT - 2000 : RELEASE_AT + 1000),
  });
  await new Promise((r) => setTimeout(r, 1200));
  const before = await state(page);
  check('starts on the Oct 17 version', before.legacyVisible && !before.belightVisible);
  await new Promise((r) => setTimeout(r, 4000)); // let its own timer fire
  const after = await state(page);
  check('flipped to BE THE LIGHT on its own', after.belightVisible && !after.legacyVisible,
    `belight=${after.belightVisible} legacy=${after.legacyVisible}`);
  const introShown = await page.evaluate(() => { const e = document.getElementById('intro-light'); return !!e && getComputedStyle(e).display !== 'none'; });
  check('did not take over with a full-screen entrance', !introShown);
  check('meetup id switched to 009', after.meetupId === '009', after.meetupId);
  check('no JS errors', errors.length === 0, errors.join('|'));
  await page.close();
}

console.log('\n=== 5. INACTIVE TAB RETURNING TO FOCUS ===');
{
  let phase = RELEASE_AT - 600000; // 10 min before
  const { page, errors, calls } = await open({ nowAt: phase, onResponse: (n, cur) => cur });
  await new Promise((r) => setTimeout(r, 2500));
  check('starts on Oct 17 version', (await state(page)).legacyVisible);
  const callsBefore = calls();
  // Simulate the tab being hidden and coming back after the release moment passed.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.setRequestInterception(true).catch(() => {});
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await new Promise((r) => setTimeout(r, 1500));
  check('re-asked the server on becoming visible', calls() > callsBefore, `${callsBefore} -> ${calls()}`);
  check('no JS errors', errors.length === 0, errors.join('|'));
  await page.close();
}

console.log('\n=== 6. REDUCED MOTION ===');
{
  const { page, errors } = await open({ nowAt: '2026-10-18T02:00:00Z', reduced: true });
  await new Promise((r) => setTimeout(r, 1400));
  const early = await page.evaluate(() => {
    const el = document.getElementById('intro-light');
    const logo = el && el.querySelector('.il-logo');
    const txt = el && el.querySelector('.il-text');
    return {
      gone: !el,
      logoOpacity: logo ? getComputedStyle(logo).opacity : null,
      textOpacity: txt ? getComputedStyle(txt).opacity : null,
      sweep: el && el.querySelector('.il-sweep') ? getComputedStyle(el.querySelector('.il-sweep')).display : null,
    };
  });
  check('entrance resolves immediately, no animation', early.gone || (early.logoOpacity === '1' && early.textOpacity === '1'),
    JSON.stringify(early));
  check('no light sweep under reduced motion', early.gone || early.sweep === 'none', String(early.sweep));
  await new Promise((r) => setTimeout(r, 1500));
  const st = await state(page);
  check('content still reaches BE THE LIGHT', st.belightVisible);
  check('page unlocked', !st.locked);
  check('no JS errors', errors.length === 0, errors.join('|'));
  await page.close();
}

console.log('\n=== 7. LAYOUT (mobile + desktop, released) ===');
for (const [label, w, h] of [['mobile 390', 390, 844], ['tablet 768', 768, 1024], ['desktop 1280', 1280, 900]]) {
  const { page, errors } = await open({ width: w, height: h, nowAt: '2026-10-18T02:00:00Z' });
  await new Promise((r) => setTimeout(r, 3400));
  const st = await state(page);
  const contrast = await page.evaluate(() => {
    const h1 = document.querySelector('.bl-headline');
    const btn = document.getElementById('bl-rsvp-btn');
    return {
      headlineSize: h1 ? parseFloat(getComputedStyle(h1).fontSize) : 0,
      btnHeight: btn ? Math.round(btn.getBoundingClientRect().height) : 0,
      btnVisible: btn ? btn.getBoundingClientRect().width > 100 : false,
    };
  });
  check(`${label}: no sideways scroll`, !st.overflow);
  check(`${label}: RSVP button is a real tap target`, contrast.btnHeight >= 44 && contrast.btnVisible,
    `${contrast.btnHeight}px tall`);
  check(`${label}: headline scales`, contrast.headlineSize >= 50, contrast.headlineSize + 'px');
  check(`${label}: no JS errors`, errors.length === 0, errors.join('|'));
  await page.close();
}

console.log('\n=== 8. KEYBOARD + RSVP ROUTING ===');
{
  const { page, errors } = await open({ nowAt: '2026-10-18T02:00:00Z' });
  await new Promise((r) => setTimeout(r, 3400));
  const focusable = await page.evaluate(() => {
    const btn = document.getElementById('bl-rsvp-btn');
    btn.focus();
    const s = getComputedStyle(btn);
    return { focused: document.activeElement === btn, tag: btn.tagName };
  });
  check('RSVP button is keyboard focusable', focusable.focused && focusable.tag === 'BUTTON');
  // Real click, then confirm the posted payload names meetup 009.
  let posted = null;
  page.on('request', (r) => { if (r.url().includes('/api/join')) posted = r.postData(); });
  await page.click('#bl-rsvp-btn');
  await new Promise((r) => setTimeout(r, 800));
  const modal = await page.evaluate(() => ({
    open: document.getElementById('wl-modal').classList.contains('open'),
    cta: (document.querySelector('.wlm-submit') || {}).textContent || '',
  }));
  check('RSVP opens the reserve sheet', modal.open, JSON.stringify(modal.cta.trim()));
  await page.type('#wlm-name', 'ZZTest');
  await page.type('#wlm-phone', '9405550188');
  await page.evaluate(() => submitWaitlist());
  await new Promise((r) => setTimeout(r, 500));
  check('consent still required', !posted, posted ? 'POSTED WITHOUT CONSENT' : 'blocked');
  await page.evaluate(() => { document.getElementById('wlm-consent').checked = true; submitWaitlist(); });
  await new Promise((r) => setTimeout(r, 900));
  check('RSVP is filed against meetup 009', !!posted && JSON.parse(posted).meetupId === '009',
    posted ? JSON.parse(posted).meetupId : 'no post');
  check('no JS errors', errors.length === 0, errors.join('|'));
  await page.close();
}

await browser.close();
console.log(`\n${fail === 0 ? 'ALL ' + pass + ' CHECKS PASSED' : pass + ' passed, ' + fail + ' FAILED'}`);
process.exit(fail ? 1 : 0);
