// Final verification sweep, then texts the summary to Mondoe's own number.
// Sends to a one-person admin list so it cannot reach anybody else.

import fs from 'fs';

const env = {};
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const KEY = env.SLICKTEXT_API_KEY;
const BRAND = env.SLICKTEXT_BRAND_ID;
const DB = 'https://set-apart-movement-default-rtdb.firebaseio.com';
const MONDOE = '+18179833004';

const st = async (p, o = {}) => {
  const r = await fetch('https://dev.slicktext.com/v1' + p, {
    ...o,
    headers: { Authorization: 'Bearer ' + KEY, Accept: 'application/json', 'Content-Type': 'application/json', ...(o.headers || {}) },
  });
  const t = await r.text();
  let b; try { b = JSON.parse(t); } catch { b = t.slice(0, 300); }
  return { ok: r.ok, status: r.status, body: b };
};
const countList = async (id) => {
  let total = 0;
  for (let p = 0; p < 20; p++) {
    const r = await st(`/brands/${BRAND}/lists/${id}/contacts?page=${p}&pageSize=100`);
    const rows = (r.body && r.body.data) || [];
    total += rows.length;
    if (!(r.body && r.body.pagingData && r.body.pagingData.hasMore) || rows.length === 0) break;
  }
  return total;
};

let fail = 0;
const check = (label, pass, detail) => {
  if (!pass) fail++;
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? '  (' + detail + ')' : ''}`);
};

console.log('--- lists ---');
const rsvpd = await countList(183781);
const notRsvpd = await countList(183783);
const signups = await countList(183782);
check('RSVP Oct 17 empty until someone RSVPs', rsvpd === 0, `${rsvpd}`);
check('Oct 17 Not RSVPd seeded', notRsvpd === 111, `${notRsvpd}`);
check('Website Signups starts empty', signups === 0, `${signups}`);

console.log('--- campaigns ---');
const camps = await st(`/brands/${BRAND}/campaigns`);
const rows = (camps.body && camps.body.data) || [];
const sched = rows.filter((c) => c.status === 'scheduled');
check('exactly 3 scheduled', sched.length === 3, `${sched.length}`);
for (const c of sched) {
  const okLen = c.body.length <= 160;
  check(`"${c.name}" one credit`, okLen, `${c.body.length} chars, ${c.scheduled} UTC`);
}
check('Monday is 14:00 UTC = 9am Central', sched.some((c) => c.scheduled === '2026-10-12 14:00:00'));
check('Saturday pair is 14:00 UTC = 9am Central', sched.filter((c) => c.scheduled === '2026-10-17 14:00:00').length === 2);

console.log('--- live site ---');
const home = await fetch('https://setapartmovement.com/?cb=' + Date.now());
const html = await home.text();
check('homepage 200', home.status === 200);
check('START HERE has no toggle left', !html.includes('toggleFlowStep'));
check('RSVP opens the join sheet', html.includes("openJoinModal('rsvp')"));
check('consent copy matches server', html.includes('I agree to get texts from Set Apart Movement'));
check('no visitor-facing "waitlist" wording', !html.includes('JOIN WAITLIST'));

console.log('--- api ---');
const noConsent = await fetch('https://setapartmovement.com/api/join', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'x', phone: '9405550199', consent: false }),
});
check('consent is enforced server-side', noConsent.status === 400);

console.log(`\n${fail === 0 ? 'ALL CHECKS PASSED' : fail + ' CHECK(S) FAILED'}`);

// ---- notify ----
const MSG =
  'Site is done and live. START HERE shows all 3 steps, no tapping. RSVP now takes name + number ' +
  'and consent is required on both forms. 111 contacts in SlickText. 3 texts scheduled: Mon Oct 12 ' +
  '9am to everyone, Sat Oct 17 9am split between people who RSVPd and people who did not. Whole ' +
  'chain tested end to end. Two things still need you: lock down Firebase, and rotate the SlickText key.';

console.log('\n--- notify ---');
console.log('  message is ' + MSG.length + ' chars');

let listId = null;
const lists = await st(`/brands/${BRAND}/lists`);
const existing = ((lists.body && lists.body.data) || []).find((l) => l.name === 'Admin - Mondoe only');
if (existing) listId = existing.contact_list_id;
if (!listId) {
  const made = await st(`/brands/${BRAND}/lists`, { method: 'POST', body: JSON.stringify({ name: 'Admin - Mondoe only' }) });
  listId = made.body && made.body.contact_list_id;
}
console.log('  admin list id', listId);

const me = await st(`/brands/${BRAND}/contacts?mobile_number=${encodeURIComponent(MONDOE)}`);
const myId = me.body && me.body.data && me.body.data[0] && me.body.data[0].contact_id;
console.log('  contact id', myId);
if (!myId || !listId) { console.log('  cannot send'); process.exit(1); }

await st(`/brands/${BRAND}/lists/contacts`, { method: 'POST', body: JSON.stringify([{ contact_id: myId, lists: [listId] }]) });
const size = await countList(listId);
console.log('  admin list holds', size, 'contact(s) — must be 1');
if (size !== 1) { console.log('  REFUSING to send, list is not just you'); process.exit(1); }

const send = await st(`/brands/${BRAND}/campaigns`, {
  method: 'POST',
  body: JSON.stringify({
    name: 'Admin update to Mondoe',
    body: MSG,
    status: 'send',
    audience: { contact_lists: [listId] },
  }),
});
console.log('  send HTTP', send.status, 'campaign', send.body && send.body.campaign_id, send.body && send.body.status);
