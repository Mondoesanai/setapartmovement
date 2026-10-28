// Replaces the scheduled Saturday reminder with the corrected 6-9pm time.
// Campaigns cannot be PATCHed on this API (405), so the only way to change a scheduled send is
// delete then recreate. Delete first: a brief gap is recoverable, two live copies would text
// everyone twice.

import fs from 'fs';

const env = {};
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const KEY = env.SLICKTEXT_API_KEY;
const BRAND = env.SLICKTEXT_BRAND_ID;

const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ" +
  " !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§" +
  "¿abcdefghijklmnopqrstuvwxyzäöñüà";

const OLD_ID = 383764;
const AUDIENCE = [188989, 195158]; // RSVP Oct 31 + Oct 31 Not RSVPd — disjoint, together everyone
const WHEN = '2026-10-31 14:00:00'; // 9:00 AM Central (CDT, UTC-5)
const BODY = "TODAY'S THE DAY! Set Apart Movement is tonight, 6-9pm at Denton Town Square. Still room for you, pull up. setapartmovement.com for more info";

const st = async (p, o = {}) => {
  const r = await fetch('https://dev.slicktext.com/v1' + p, {
    ...o,
    headers: { Authorization: 'Bearer ' + KEY, Accept: 'application/json', 'Content-Type': 'application/json', ...(o.headers || {}) },
  });
  const t = await r.text();
  let b; try { b = JSON.parse(t); } catch { b = t.slice(0, 300); }
  return { ok: r.ok, status: r.status, body: b };
};

const bad = [...BODY].filter((c) => !GSM7.includes(c));
if (bad.length) { console.error('REFUSING: non-GSM7 ' + JSON.stringify(bad)); process.exit(1); }
if (BODY.length > 160) { console.error(`REFUSING: ${BODY.length} chars = 2 credits`); process.exit(1); }
if (BODY.includes('6-8')) { console.error('REFUSING: still says 6-8'); process.exit(1); }
console.log(`new body: ${BODY.length}/160 chars, 1 credit, GSM-7 clean, says 6-9pm`);

const before = await st(`/brands/${BRAND}/campaigns/${OLD_ID}`);
console.log(`old campaign ${OLD_ID}: status=${before.body && before.body.status}`);
if (before.body && before.body.status !== 'scheduled') {
  console.error('REFUSING: old campaign is no longer "scheduled" — it may have already sent.');
  process.exit(1);
}

const del = await st(`/brands/${BRAND}/campaigns/${OLD_ID}`, { method: 'DELETE' });
console.log(`deleted old: HTTP ${del.status}`);

const made = await st(`/brands/${BRAND}/campaigns`, {
  method: 'POST',
  body: JSON.stringify({
    name: 'Oct 31 - day of (everyone) 6-9pm',
    body: BODY,
    status: 'scheduled',
    scheduled: WHEN,
    audience: { contact_lists: AUDIENCE },
  }),
});
console.log(`created new: HTTP ${made.status} id=${made.body && made.body.campaign_id}`);

await new Promise((r) => setTimeout(r, 4000));

console.log('\n--- read back every scheduled campaign ---');
const all = await st(`/brands/${BRAND}/campaigns`);
const sched = ((all.body && all.body.data) || []).filter((c) => c.status === 'scheduled');
sched.forEach((c) => {
  console.log(`  ${c.campaign_id}  ${c.scheduled} UTC  ${c.body.length} chars`);
  console.log(`     "${c.body}"`);
});
console.log(`\nscheduled count: ${sched.length} (must be exactly 1 — a duplicate would double-text)`);
const stillOld = sched.filter((c) => c.body.includes('6-8'));
console.log(`any still saying 6-8: ${stillOld.length} (must be 0)`);

const usage = await st(`/brands/${BRAND}/usage`);
console.log(`\ncredits: ${usage.body && usage.body.credits_available} available, Saturday needs ~114`);
