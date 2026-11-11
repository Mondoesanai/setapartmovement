// End-to-end test of the RSVP path for Meetup 010, against whatever BASE points at.
// Uses a 555-01xx number, which is reserved for fiction and can never reach a real person.
// Checks the record landed in Firebase AND in the right SlickText lists, then removes every
// trace it created. Spends no credits — it never sends a message.
//
//   node e2e-join-010.mjs                      (local, http://localhost:3000)
//   BASE=https://setapartmovement.com node e2e-join-010.mjs

import fs from 'fs';

const env = {};
for (const l of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const KEY = env.SLICKTEXT_API_KEY;
const BRAND = env.SLICKTEXT_BRAND_ID;
const ST = 'https://dev.slicktext.com/v1';
const DB = 'https://set-apart-movement-default-rtdb.firebaseio.com';
const BASE = process.env.BASE || 'http://localhost:3000';

const PHONE = '9405550162';
const E164 = '+1' + PHONE;
const WEBSITE_SIGNUPS = 183782;
const RSVP_010 = 199787;
const NOT_RSVPD_010 = 199788;

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? '  (' + detail + ')' : ''}`);
};

const st = async (p, o = {}) => {
  const r = await fetch(ST + p, {
    ...o,
    headers: { Authorization: 'Bearer ' + KEY, Accept: 'application/json', 'Content-Type': 'application/json', ...(o.headers || {}) },
  });
  const t = await r.text();
  let b; try { b = JSON.parse(t); } catch { b = null; }
  return { ok: r.ok, status: r.status, body: b };
};
const inList = async (listId) => {
  for (let p = 0; p < 10; p++) {
    const r = await st(`/brands/${BRAND}/lists/${listId}/contacts?page=${p}&pageSize=100`);
    const rows = (r.body && r.body.data) || [];
    if (rows.some((c) => c.mobile_number === E164)) return true;
    if (!(r.body && r.body.pagingData && r.body.pagingData.hasMore) || !rows.length) break;
  }
  return false;
};

const skip = (label, why) => console.log(`  SKIP  ${label}  (${why})`);

console.log(`testing ${BASE}/api/join`);

// SlickText reachability is an environment fact, not a product fault — this host does not
// resolve from every network. Probe it, then assert only what can actually be observed here.
const stReachable = await fetch(ST + '/brands', { signal: AbortSignal.timeout(8000) })
  .then(() => true).catch(() => false);
console.log(`slicktext reachable from here: ${stReachable ? 'yes' : 'no — list checks will be skipped'}`);

console.log('\n1. consent is mandatory');
{
  const r = await fetch(`${BASE}/api/join`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test NoConsent', phone: PHONE, kind: 'rsvp', meetupId: '010' }),
  });
  check('an RSVP without the box ticked is rejected', r.status === 400, 'HTTP ' + r.status);
  const stored = await (await fetch(`${DB}/contacts/${PHONE}.json`)).json();
  check('  and nothing was stored', stored === null);
}

console.log('\n2. a real RSVP for meetup 010');
const res = await fetch(`${BASE}/api/join`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'E2E Test 010', phone: PHONE, consent: true, kind: 'rsvp', meetupId: '010' }),
});
const out = await res.json().catch(() => ({}));
check('accepted', res.ok, 'HTTP ' + res.status);
if (stReachable) check('no pending sync owed', !out.pendingSync, JSON.stringify(out).slice(0, 120));
// The signup must survive SlickText being unreachable — it is best-effort, and the contact is
// already safe in Firebase by that point.
else check('signup still succeeds with slicktext unreachable', res.ok && out.ok === true,
  JSON.stringify(out).slice(0, 110));

console.log('\n3. it is in Firebase, filed against meetup 010');
const rec = await (await fetch(`${DB}/contacts/${PHONE}.json`)).json();
check('contact record exists', !!rec);
check('consent recorded', rec && rec.smsConsent === true);
check('consent wording stored verbatim', !!(rec && rec.consentText && rec.consentText.includes('Reply STOP')));
check('RSVP filed under 010', !!(rec && rec.rsvps && rec.rsvps['010']));
check('not filed under any other meetup',
  !!(rec && rec.rsvps && Object.keys(rec.rsvps).length === 1), rec && rec.rsvps && Object.keys(rec.rsvps).join(','));
check('attendance NOT incremented by an RSVP', rec && rec.meetupsAttended === 0, rec && String(rec.meetupsAttended));
const wl = await (await fetch(`${DB}/waitlist/${PHONE}.json`)).json();
check('mirrored to waitlist so the live counter is right', !!wl);

console.log('\n4. it is in the right SlickText lists');
if (!stReachable) {
  skip('list membership', 'slicktext unreachable from this machine');
} else {
  await new Promise((r) => setTimeout(r, 1500));
  check('in Website Signups', await inList(WEBSITE_SIGNUPS));
  check('in RSVP Nov 14', await inList(RSVP_010));
  check('NOT in Nov 14 Not RSVPd (would double-text them)', !(await inList(NOT_RSVPD_010)));
}

console.log('\n5. cleanup');
{
  const a = await fetch(`${DB}/contacts/${PHONE}.json`, { method: 'DELETE' });
  const b = await fetch(`${DB}/waitlist/${PHONE}.json`, { method: 'DELETE' });
  check('firebase contact removed', a.ok);
  check('firebase waitlist row removed', b.ok);
  if (!stReachable) {
    skip('slicktext cleanup', 'nothing was created there');
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
  const found = await st(`/brands/${BRAND}/contacts?mobile_number=${encodeURIComponent(E164)}`);
  const id = ((found.body && found.body.data) || [])[0]?.contact_id;
  if (id) {
    const d = await st(`/brands/${BRAND}/contacts/${id}`, { method: 'DELETE' });
    check('slicktext contact removed', d.ok, 'HTTP ' + d.status);
  } else {
    check('slicktext contact removed', true, 'was not created');
  }
  const still = await (await fetch(`${DB}/contacts/${PHONE}.json`)).json();
  check('nothing left behind in firebase', still === null);
  const stillSt = await st(`/brands/${BRAND}/contacts?mobile_number=${encodeURIComponent(E164)}`);
  check('nothing left behind in slicktext', (((stillSt.body && stillSt.body.data) || []).length === 0));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
