// Rewrites the two Saturday campaigns in place. Two credits is allowed now, so GSM-7 multipart
// gives 153 chars per segment (not 160 — concatenation headers eat 7), i.e. 306 total.

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

const RSVPD_CAMPAIGN = 363861;
const NOT_RSVPD_CAMPAIGN = 363862;

const updates = [
  {
    id: RSVPD_CAMPAIGN,
    list: 183781,
    name: 'Oct 17 - day of (RSVPd)',
    body:
      "Yo! Today is the day. Set Apart Movement is tonight and I'm hyped you said you're in. " +
      "Your spot is saved. If you can, grab somebody and bring them with you, that's what makes " +
      "these nights hit different. All the info: setapartmovement.com See you tonight!",
  },
  {
    id: NOT_RSVPD_CAMPAIGN,
    list: 183783,
    name: 'Oct 17 - day of (not RSVPd)',
    body:
      "Yo! Today is the day. Set Apart Movement is tonight and there's still room for you. " +
      "No RSVP needed, no cost, just pull up. Bring a friend if you can. It's always better when " +
      "more of us are in the room: setapartmovement.com Hope to see you!",
  },
];

const st = async (p, o = {}) => {
  const r = await fetch('https://dev.slicktext.com/v1' + p, {
    ...o,
    headers: { Authorization: 'Bearer ' + KEY, Accept: 'application/json', 'Content-Type': 'application/json', ...(o.headers || {}) },
  });
  const t = await r.text();
  let b; try { b = JSON.parse(t); } catch { b = t.slice(0, 300); }
  return { ok: r.ok, status: r.status, body: b };
};

let bad = 0;
for (const u of updates) {
  const offenders = [...u.body].filter((ch) => !GSM7.includes(ch));
  const len = u.body.length;
  const credits = len <= 160 ? 1 : Math.ceil(len / 153);
  console.log(`${u.name}\n  chars=${len}  credits=${credits}  non-GSM7=${offenders.length ? JSON.stringify(offenders) : 'none'}`);
  if (offenders.length) { console.log('  REFUSING: non-GSM7 would make this cost double again'); bad++; continue; }
  if (credits > 2) { console.log('  REFUSING: over the 2-credit budget'); bad++; continue; }

  // PATCH is 405 on this API, so the only way to change a scheduled send is to replace it.
  // Delete first: a brief window with no send is recoverable, two live copies would double-text.
  const d = await st(`/brands/${BRAND}/campaigns/${u.id}`, { method: 'DELETE' });
  console.log(`  deleted old HTTP ${d.status}`);
  const r = await st(`/brands/${BRAND}/campaigns`, {
    method: 'POST',
    body: JSON.stringify({
      name: u.name,
      body: u.body,
      status: 'scheduled',
      scheduled: '2026-10-17 14:00:00',
      audience: { contact_lists: [u.list] },
    }),
  });
  console.log(`  created new HTTP ${r.status} id=${r.body && r.body.campaign_id}`);
  u.newId = r.body && r.body.campaign_id;
  if (!r.ok) bad++;
}

console.log('\n--- read back from the live account ---');
for (const u of updates) {
  const g = await st(`/brands/${BRAND}/campaigns/${u.newId || u.id}`);
  const c = g.body || {};
  const match = c.body === u.body;
  console.log(`${c.status === 'scheduled' ? 'OK  ' : 'WARN'} ${c.name}`);
  console.log(`     scheduled=${c.scheduled} UTC  status=${c.status}  text matches=${match}  chars=${(c.body || '').length}`);
  console.log(`     "${(c.body || '').slice(0, 120)}..."`);
  if (!match || c.status !== 'scheduled') bad++;
}

console.log(bad === 0 ? '\nALL GOOD' : `\n${bad} PROBLEM(S)`);
