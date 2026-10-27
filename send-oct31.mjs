// Sends the approved Oct 26 announcement and schedules the Oct 31 day-of reminder.
// Refuses to send anything that is not exactly the approved text, is over one credit, or
// leaves GSM-7. Audience is the two Oct 31 lists, which are disjoint and together cover everyone.

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

const RSVPD = 188989;      // RSVP Oct 31 - Be The Light
const NOT_RSVPD = 195158;  // Oct 31 Not RSVPd
const AUDIENCE = [RSVPD, NOT_RSVPD];

const SEND_NOW = "YOOO this is Mondoe. Our next meetup is this Sat, Oct 31, 6-8pm at Denton Town Square. Free. Would love to see you there. setapartmovement.com for more info";
const SATURDAY = "TODAY'S THE DAY! Set Apart Movement is tonight, 6-8pm at Denton Town Square. Still room for you, pull up. setapartmovement.com for more info";
const SATURDAY_AT = '2026-10-31 14:00:00'; // 9:00 AM Central (CDT, UTC-5) — DST ends Nov 1

const st = async (p, o = {}) => {
  const r = await fetch('https://dev.slicktext.com/v1' + p, {
    ...o,
    headers: { Authorization: 'Bearer ' + KEY, Accept: 'application/json', 'Content-Type': 'application/json', ...(o.headers || {}) },
  });
  const t = await r.text();
  let b; try { b = JSON.parse(t); } catch { b = t.slice(0, 300); }
  return { ok: r.ok, status: r.status, body: b };
};

function guard(label, body) {
  const bad = [...body].filter((c) => !GSM7.includes(c));
  if (bad.length) { console.error(`REFUSING ${label}: non-GSM7 ${JSON.stringify(bad)}`); process.exit(1); }
  if (body.length > 160) { console.error(`REFUSING ${label}: ${body.length} chars = 2 credits`); process.exit(1); }
  console.log(`  ${label}: ${body.length}/160 chars, 1 credit, GSM-7 clean`);
}

console.log('pre-flight');
guard('send now ', SEND_NOW);
guard('saturday ', SATURDAY);

const usage = await st(`/brands/${BRAND}/usage`);
const avail = usage.body && usage.body.credits_available;
console.log(`  credits available: ${avail}`);

const countList = async (id) => {
  let t = 0;
  for (let p = 0; p < 20; p++) {
    const r = await st(`/brands/${BRAND}/lists/${id}/contacts?page=${p}&pageSize=100`);
    const rows = (r.body && r.body.data) || [];
    t += rows.length;
    if (!(r.body && r.body.pagingData && r.body.pagingData.hasMore) || !rows.length) break;
  }
  return t;
};
const a = await countList(RSVPD), b2 = await countList(NOT_RSVPD);
const recipients = a + b2;
console.log(`  audience: ${a} RSVP'd + ${b2} not = ${recipients} (lists are disjoint)`);

// Today's send must be able to complete on its own. Running out partway would cut people off
// at an arbitrary point with no way to tell who got it.
if (avail < recipients) {
  console.error(`REFUSING: ${avail} credits cannot cover ${recipients} recipients for today's send.`);
  process.exit(1);
}
console.log(`  today needs ${recipients}, leaving ~${avail - recipients} for Saturday (which needs ~${recipients})`);

console.log('\n1. sending the announcement now');
const now = await st(`/brands/${BRAND}/campaigns`, {
  method: 'POST',
  body: JSON.stringify({
    name: 'Oct 31 - Monday announcement',
    body: SEND_NOW,
    status: 'send',
    audience: { contact_lists: AUDIENCE },
  }),
});
console.log(`   HTTP ${now.status} id=${now.body && now.body.campaign_id} status=${now.body && now.body.status}`);

console.log('\n2. scheduling the day-of reminder');
const sat = await st(`/brands/${BRAND}/campaigns`, {
  method: 'POST',
  body: JSON.stringify({
    name: 'Oct 31 - day of (everyone)',
    body: SATURDAY,
    status: 'scheduled',
    scheduled: SATURDAY_AT,
    audience: { contact_lists: AUDIENCE },
  }),
});
console.log(`   HTTP ${sat.status} id=${sat.body && sat.body.campaign_id} scheduled=${sat.body && sat.body.scheduled} UTC`);

await new Promise((r) => setTimeout(r, 12000));

console.log('\n--- read back ---');
const all = await st(`/brands/${BRAND}/campaigns`);
for (const c of ((all.body && all.body.data) || []).slice(0, 4)) {
  console.log(`  ${String(c.campaign_id).padEnd(7)}${String(c.status).padEnd(11)}${String(c.scheduled || '-').padEnd(21)}size=${String(c.audience_size || '-').padEnd(5)}${c.name}`);
}
const after = await st(`/brands/${BRAND}/usage`);
console.log(`\ncredits: ${avail} -> ${after.body && after.body.credits_available}`);
