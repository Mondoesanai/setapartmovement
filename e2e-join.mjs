// End-to-end test of the live signup path, using a 555-01xx number that can never be delivered
// to. Submits a real RSVP to production, checks it landed in BOTH Firebase and SlickText with
// the right list membership, then removes every trace it created.

import fs from 'fs';

const env = {};
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const KEY = env.SLICKTEXT_API_KEY;
const BRAND = env.SLICKTEXT_BRAND_ID;
const ST = 'https://dev.slicktext.com/v1';
const DB = 'https://set-apart-movement-default-rtdb.firebaseio.com';

const PHONE = '9405550147';
const E164 = '+1' + PHONE;
const LISTS = { websiteSignups: 183782, rsvpOct17: 183781, oct17NotRsvpd: 183783 };

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
  const r = await st(`/brands/${BRAND}/lists/${listId}/contacts?page=0&pageSize=100`);
  return ((r.body && r.body.data) || []).some((c) => c.mobile_number === E164);
};

console.log('--- before ---');
console.log('  already in SlickText?', ((await st(`/brands/${BRAND}/contacts?mobile_number=${encodeURIComponent(E164)}`)).body?.data || []).length > 0);

console.log('\n1. POST a real RSVP to production');
const res = await fetch('https://setapartmovement.com/api/join', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'ZZTest', phone: PHONE, consent: true, kind: 'rsvp', meetupId: '008' }),
});
console.log('   HTTP', res.status, (await res.text()).slice(0, 200));

await new Promise((r) => setTimeout(r, 2500));

console.log('\n2. did it land in Firebase?');
const fb = await (await fetch(`${DB}/contacts/${PHONE}.json`)).json();
console.log('   contact record:', fb ? JSON.stringify(fb).slice(0, 260) : 'NOT FOUND');
console.log('   rsvp for 008 recorded:', !!(fb && fb.rsvps && fb.rsvps['008']));
console.log('   consent stored:', !!(fb && fb.smsConsent), '| meetupsAttended:', fb && fb.meetupsAttended);

console.log('\n3. did it land in SlickText?');
const found = await st(`/brands/${BRAND}/contacts?mobile_number=${encodeURIComponent(E164)}`);
const contact = (found.body && found.body.data && found.body.data[0]) || null;
console.log('   contact:', contact ? `${contact.contact_id} ${contact.first_name} ${contact.opt_in_status}` : 'NOT FOUND');

console.log('\n4. list membership (the bit that decides which Saturday text they get)');
console.log('   Website Signups :', await inList(LISTS.websiteSignups), '(expect true)');
console.log('   RSVP Oct 17     :', await inList(LISTS.rsvpOct17), '(expect true)');
console.log('   Oct 17 Not RSVPd:', await inList(LISTS.oct17NotRsvpd), '(expect FALSE — must not get both)');

console.log('\n5. cleanup');
if (contact) {
  const d = await st(`/brands/${BRAND}/contacts/${contact.contact_id}`, { method: 'DELETE' });
  console.log('   slicktext delete HTTP', d.status);
}
for (const node of [`contacts/${PHONE}`, `waitlist/${PHONE}`]) {
  const r = await fetch(`${DB}/${node}.json`, { method: 'DELETE' });
  console.log(`   firebase delete ${node} HTTP`, r.status);
}
const gone = await (await fetch(`${DB}/contacts/${PHONE}.json`)).json();
console.log('   firebase record after cleanup:', gone === null ? 'gone' : 'STILL THERE');
