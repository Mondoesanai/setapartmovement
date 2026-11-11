// Walks the admin unlock the way Mondoe does: open the hamburger, find the Admin link, tap it,
// type a password, get in. Uses a throwaway password set only for this run, never the real one.
//
//   node verify-admin.mjs            (expects `node serve.mjs` with ADMIN_PASSWORD set)
//
// Also checks that the two buttons that used to hover over the page are gone and that the
// in-flow pills replaced them.

import puppeteer from 'puppeteer';

const BASE = process.env.BASE || 'http://localhost:3000';
const TEST_PW = process.env.TEST_ADMIN_PASSWORD || 'test-only-not-the-real-one';

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? '  (' + detail + ')' : ''}`);
};

const browser = await puppeteer.launch({ headless: 'shell', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

// A native prompt would hang the run. Nothing should open one any more; if something does,
// this makes it a visible failure instead of a 180-second timeout.
let sawNativeDialog = false;
page.on('dialog', async (d) => { sawNativeDialog = true; await d.dismiss(); });

await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
await page.waitForFunction(() => !document.body.classList.contains('locked'), { timeout: 12000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 500));

console.log('\n1. the floating buttons are gone, the pills are in the page');
{
  const s = await page.evaluate(() => {
    const vis = (id) => { const e = document.getElementById(id); return !!(e && e.offsetParent !== null); };
    const pills = [...document.querySelectorAll('.sam-utility a, .sam-utility button')].map((e) => e.textContent.trim());
    const u = document.querySelector('.sam-utility');
    return {
      fabFloating: vis('sam-fab'),
      bubbleFloating: vis('wl-bubble'),
      pills,
      pillsInFlow: !!u && getComputedStyle(u).position === 'static',
      anyFixedOverlap: [...document.querySelectorAll('body > button')]
        .filter((e) => getComputedStyle(e).position === 'fixed' && e.offsetParent !== null)
        .map((e) => e.id || e.textContent.trim().slice(0, 20)),
    };
  });
  check('Rankings no longer floats over the page', !s.fabFloating);
  check('GET THE TEXT no longer floats over the page', !s.bubbleFloating);
  check('both pills are in the page flow', s.pillsInFlow, s.pills.join(' | '));
  check('Rankings pill first, Get the text second',
    s.pills.length === 2 && /Rankings/i.test(s.pills[0]) && /Get the text/i.test(s.pills[1]), s.pills.join(' | '));
  check('no stray fixed buttons left hovering', s.anyFixedOverlap.length === 0, s.anyFixedOverlap.join(',') || 'none');
}

console.log('\n2. the lock sits beside the X, where a phone can reach it');
{
  // It used to be the last link in the panel, pinned to the bottom — which on a phone lands
  // under the browser's own toolbar and cannot be tapped at all.
  const closed = await page.evaluate(() => {
    const l = document.getElementById('menu-lock');
    // A fixed-position element always reports offsetParent null, so that is not a visibility test.
    return { exists: !!l, shownWhenClosed: !!(l && getComputedStyle(l).display !== 'none') };
  });
  check('lock button exists', closed.exists);
  check('hidden while the menu is closed', !closed.shownWhenClosed);

  const fab = await page.evaluate(() => {
    const r = document.getElementById('menu-fab').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, right: r.right };
  });
  await page.mouse.click(fab.x, fab.y);
  await new Promise((r) => setTimeout(r, 650));
  const a = await page.evaluate(() => {
    const el = document.getElementById('menu-lock');
    const r = el.getBoundingClientRect();
    return {
      shown: getComputedStyle(el).display !== 'none',
      top: Math.round(r.top), right: Math.round(r.right),
      w: Math.round(r.width), h: Math.round(r.height),
      inUpperThird: r.top < window.innerHeight / 3,
      hasLockIcon: !!el.querySelector('svg'),
      oldBottomLinkGone: !document.getElementById('menu-admin-link'),
    };
  });
  check('appears when the menu opens', a.shown);
  check('at the top of the screen, not the bottom', a.inUpperThird, 'top ' + a.top + 'px');
  check('to the left of the X', a.right < fab.right - 20, a.right + ' vs X ' + Math.round(fab.right));
  check('44px tap target', a.w >= 44 && a.h >= 44, a.w + 'x' + a.h);
  check('drawn as a lock', a.hasLockIcon);
  check('the old unreachable bottom link is gone', a.oldBottomLinkGone);
}

console.log('\n3. tapping it shows a password field, in the page');
{
  const box = await page.evaluate(() => {
    const r = document.getElementById('menu-lock').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(box.x, box.y);
  await new Promise((r) => setTimeout(r, 900));
  const s = await page.evaluate(() => {
    const panel = document.getElementById('wl-admin-panel');
    const input = document.getElementById('wla-pw');
    return {
      panelOpen: !!(panel && panel.classList.contains('open')),
      inputVisible: !!(input && input.offsetParent !== null),
      inputType: input && input.type,
      fontSize: input ? parseFloat(getComputedStyle(input).fontSize) : 0,
      hasButton: !!document.querySelector('.wla-lock-btn'),
    };
  });
  check('admin panel opened', s.panelOpen);
  check('a password field is right there', s.inputVisible);
  check('it is a real password field', s.inputType === 'password', s.inputType);
  check('16px+, so iOS does not zoom the page on focus', s.fontSize >= 16, s.fontSize + 'px');
  check('and an Unlock button', s.hasButton);
  check('no native popup was used', !sawNativeDialog);
}

console.log('\n4. a wrong password says so and lets you retry');
{
  await page.click('#wla-pw');
  await page.type('#wla-pw', 'definitely-wrong-password');
  await page.click('.wla-lock-btn');
  await new Promise((r) => setTimeout(r, 1800));
  const s = await page.evaluate(() => {
    const err = document.querySelector('.wla-lock-err');
    return {
      errText: err ? err.textContent.trim() : null,
      canRetry: !!document.getElementById('wla-pw'),
      body: (document.getElementById('wla-body') || {}).innerText || '',
    };
  });
  check('an error is shown', !!s.errText, s.errText || s.body.slice(0, 70));
  check('the field comes back so you can try again', s.canRetry);
  check('no dead end', !/could not load/i.test(s.body), s.body.slice(0, 60));
}

console.log('\n5. the right password gets in');
{
  await page.evaluate(() => { document.getElementById('wla-pw').value = ''; });
  await page.click('#wla-pw');
  await page.type('#wla-pw', TEST_PW);
  await page.click('.wla-lock-btn');
  await new Promise((r) => setTimeout(r, 2500));
  const s = await page.evaluate(() => {
    const body = document.getElementById('wla-body');
    return {
      stillLocked: !!document.getElementById('wla-pw'),
      text: (body && body.innerText || '').replace(/\s+/g, ' ').slice(0, 160),
    };
  });
  check('unlocked — the password field is gone', !s.stillLocked, s.text.slice(0, 80));
  check('and real admin content loaded', !/not right|password/i.test(s.text), s.text.slice(0, 80));
}

console.log('\n6. the waitlist is a list you can work straight down');
{
  const s = await page.evaluate(() => {
    const body = document.getElementById('wla-body');
    const rows = body.querySelectorAll('.wla-row');
    const sms = body.querySelectorAll('.wla-phone a[href^="sms:"]');
    const bad = [...sms].filter((a) => !/^sms:\+1\d{10}$/.test(a.getAttribute('href')));
    return {
      header: (body.querySelector('.wla-count-hd') || {}).textContent || '',
      rows: rows.length,
      sms: sms.length,
      tags: body.querySelectorAll('.wla-tag').length,
      badHrefs: bad.map((a) => a.getAttribute('href')).slice(0, 3),
    };
  });
  console.log(`      ${s.header}`);
  check('rows rendered', s.rows > 0, s.rows + ' people');
  check('every row is a one-tap text', s.sms === s.rows, `${s.sms}/${s.rows}`);
  // Older rows are stored as E.164, newer ones as ten digits; prefixing +1 onto an already
  // prefixed number produced sms:+118179833004, which dials nothing.
  check('no double country codes', s.badHrefs.length === 0, s.badHrefs.join(', ') || 'all well formed');
  check('imported people are marked', s.tags > 0, s.tags + ' tagged');
  check('header separates site signups from imports', /via site/.test(s.header) && /imported/.test(s.header));
}

await page.screenshot({ path: 'temporary screenshots/admin-unlocked.png' });
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
