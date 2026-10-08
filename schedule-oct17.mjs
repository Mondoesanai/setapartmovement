// Schedules the three Oct 17 campaigns.
//
// SlickText stores times in UTC — confirmed by comparing its `created` stamp against the clock.
// Central is UTC-5 right now (CDT runs until Nov 1), so 9:00 AM Central is 14:00 UTC. Scheduling
// "09:00:00" here would have sent at 4 AM.
//
// Audience note: campaigns can target lists but cannot exclude one, so the Saturday pair uses two
// non-overlapping lists. "RSVP Oct 17" + "Oct 17 Not RSVPd" together are everyone, which is why
// Monday targets both rather than the source lists — new signups land in one or the other
// automatically, so the Monday audience stays correct without being touched again.

import fs from 'fs';

const env = {};
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const KEY = env.SLICKTEXT_API_KEY;
const BRAND = env.SLICKTEXT_BRAND_ID;

const RSVPD = 183781;
const NOT_RSVPD = 183783;

const st = async (p, o = {}) => {
  const r = await fetch('https://dev.slicktext.com/v1' + p, {
    ...o,
    headers: { Authorization: 'Bearer ' + KEY, Accept: 'application/json', 'Content-Type': 'application/json', ...(o.headers || {}) },
  });
  const t = await r.text();
  let b; try { b = JSON.parse(t); } catch { b = t.slice(0, 300); }
  return { ok: r.ok, status: r.status, body: b };
};

const campaigns = [
  {
    name: 'Oct 17 - Monday announcement',
    body: 'Hey! Set Apart Movement is back this Saturday night and we would love to have you there. All the info is here: setapartmovement.com Reply STOP to end',
    scheduled: '2026-10-12 14:00:00', // Mon Oct 12, 9:00 AM Central
    lists: [RSVPD, NOT_RSVPD],
  },
  {
    name: 'Oct 17 - day of (RSVPd)',
    body: 'Today is the day! You already saved your spot so we are counting on you tonight. Everything you need is here: setapartmovement.com Cannot wait to see you!',
    scheduled: '2026-10-17 14:00:00', // Sat Oct 17, 9:00 AM Central
    lists: [RSVPD],
  },
  {
    name: 'Oct 17 - day of (not RSVPd)',
    body: 'Today is the day! Set Apart Movement is tonight and there is still room for you. All the info is here: setapartmovement.com Hope to see you there!',
    scheduled: '2026-10-17 14:00:00',
    lists: [NOT_RSVPD],
  },
];

for (const c of campaigns) {
  if (c.body.length > 160) { console.error('REFUSING, over 160 chars:', c.name); continue; }
  const r = await st(`/brands/${BRAND}/campaigns`, {
    method: 'POST',
    body: JSON.stringify({
      name: c.name,
      body: c.body,
      status: 'scheduled',
      scheduled: c.scheduled,
      audience: { contact_lists: c.lists },
    }),
  });
  console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${c.name}`);
  console.log(`     id=${r.body && r.body.campaign_id} status=${r.body && r.body.status} scheduled=${r.body && r.body.scheduled} UTC`);
  console.log(`     chars=${c.body.length} lists=${JSON.stringify(c.lists)}`);
  if (!r.ok) console.log('     ' + JSON.stringify(r.body).slice(0, 300));
}

console.log('\n--- all scheduled campaigns now on the account ---');
const all = await st(`/brands/${BRAND}/campaigns`);
for (const c of (all.body && all.body.data) || []) {
  console.log(`  ${c.campaign_id}  ${c.status.padEnd(10)} ${c.scheduled || '-'} UTC  ${c.name}`);
}
