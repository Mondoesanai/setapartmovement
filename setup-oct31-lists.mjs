// Builds the "Oct 31 Not RSVPd" bucket so Saturday's day-of send can be split.
// SlickText campaigns can target a list but cannot exclude one, so the two audiences have to be
// kept disjoint by membership. Seeds everyone currently subscribed except the people already on
// "RSVP Oct 31"; /api/join then moves people across as they reserve.
//
// Sends nothing. Safe to re-run.

import fs from 'fs';

const env = {};
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const KEY = env.SLICKTEXT_API_KEY;
const BRAND = env.SLICKTEXT_BRAND_ID;
const BASE = 'https://dev.slicktext.com/v1';

const RSVP_OCT31 = 188989;
const NOT_RSVPD = Number(process.argv[2]);
if (!NOT_RSVPD) { console.error('usage: node setup-oct31-lists.mjs <notRsvpdListId>'); process.exit(1); }

async function call(path, opts = {}) {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: {
      Authorization: 'Bearer ' + KEY, Accept: 'application/json',
      'Content-Type': 'application/json', ...(opts.headers || {}),
    },
  });
  const t = await r.text();
  let b; try { b = JSON.parse(t); } catch { b = t.slice(0, 300); }
  return { ok: r.ok, status: r.status, body: b };
}

async function pageAll(path) {
  const out = [];
  for (let p = 0; p < 25; p++) {
    const sep = path.includes('?') ? '&' : '?';
    const r = await call(`${path}${sep}page=${p}&pageSize=100`);
    if (!r.ok) { console.error('read failed', r.status); break; }
    const rows = (r.body && r.body.data) || [];
    out.push(...rows);
    if (!(r.body.pagingData && r.body.pagingData.hasMore) || rows.length === 0) break;
  }
  return out;
}

const everyone = await pageAll(`/brands/${BRAND}/contacts`);
const subscribed = everyone.filter((c) => c.opt_in_status === 'subscribed');
const rsvpd = await pageAll(`/brands/${BRAND}/lists/${RSVP_OCT31}/contacts`);
const rsvpdIds = new Set(rsvpd.map((c) => c.contact_id));

console.log(`contacts: ${everyone.length} total, ${subscribed.length} subscribed`);
console.log(`already RSVP'd for Oct 31: ${rsvpdIds.size} (${rsvpd.map((c) => c.first_name).join(', ')})`);

const target = subscribed.filter((c) => !rsvpdIds.has(c.contact_id));
console.log(`to seed into "not RSVP'd": ${target.length}`);

const ids = target.map((c) => c.contact_id);
for (let i = 0; i < ids.length; i += 50) {
  const batch = ids.slice(i, i + 50).map((contact_id) => ({ contact_id, lists: [NOT_RSVPD] }));
  const r = await call(`/brands/${BRAND}/lists/contacts`, { method: 'POST', body: JSON.stringify(batch) });
  if (!r.ok) { console.error('  add failed', r.status, JSON.stringify(r.body).slice(0, 200)); break; }
  console.log(`  batch ${i / 50 + 1}: ${JSON.stringify(r.body)}`);
}

const check = await pageAll(`/brands/${BRAND}/lists/${NOT_RSVPD}/contacts`);
const overlap = check.filter((c) => rsvpdIds.has(c.contact_id));
console.log(`\n"Oct 31 Not RSVPd" (${NOT_RSVPD}) holds ${check.length}`);
console.log(`overlap with RSVP list: ${overlap.length} (must be 0 — nobody may get both texts)`);
console.log(`combined reach: ${check.length + rsvpdIds.size} of ${subscribed.length} subscribed`);
