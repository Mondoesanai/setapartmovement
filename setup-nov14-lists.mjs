// Creates the two SlickText buckets for Meetup 010 (CONNECT, 14 November) and seeds the
// "not RSVP'd" one with everyone currently subscribed.
//
// Why two lists: a campaign can target a list but cannot exclude one, so "RSVP'd" and
// "not RSVP'd" have to be kept disjoint by membership rather than worked out at send time.
// /api/join moves a person across the moment they reserve.
//
// Sends nothing and spends no credits. Safe to re-run: it reuses lists with the same names
// instead of making duplicates.

import fs from 'fs';

const env = {};
for (const l of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const KEY = env.SLICKTEXT_API_KEY;
const BRAND = env.SLICKTEXT_BRAND_ID;
const BASE = 'https://dev.slicktext.com/v1';

const RSVP_NAME = 'RSVP Nov 14 - CONNECT';
const NOT_NAME = 'Nov 14 Not RSVPd';

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

// Paging is 0-indexed here and pageSize must be sent whenever page is.
async function pageAll(path) {
  const out = [];
  for (let p = 0; p < 25; p++) {
    const sep = path.includes('?') ? '&' : '?';
    const r = await call(`${path}${sep}page=${p}&pageSize=100`);
    if (!r.ok) { console.error('  read failed', r.status); break; }
    const rows = (r.body && r.body.data) || [];
    out.push(...rows);
    if (!(r.body.pagingData && r.body.pagingData.hasMore) || rows.length === 0) break;
  }
  return out;
}

const lists = await pageAll(`/brands/${BRAND}/lists`);
// The id field on a list row is contact_list_id — not list_id, and not id.
const find = (name) => lists.find((l) => (l.name || '').trim() === name);

async function ensure(name) {
  const existing = find(name);
  if (existing) {
    console.log(`  reusing "${name}" (${existing.contact_list_id})`);
    return existing.contact_list_id;
  }
  const r = await call(`/brands/${BRAND}/lists`, { method: 'POST', body: JSON.stringify({ name }) });
  if (!r.ok) { console.error(`  could not create "${name}":`, r.status, JSON.stringify(r.body).slice(0, 200)); process.exit(1); }
  const id = r.body && (r.body.contact_list_id || r.body.list_id || r.body.id);
  console.log(`  created "${name}" (${id})`);
  return id;
}

console.log('lists');
const RSVP_ID = await ensure(RSVP_NAME);
const NOT_ID = await ensure(NOT_NAME);

const everyone = await pageAll(`/brands/${BRAND}/contacts`);
const subscribed = everyone.filter((c) => c.opt_in_status === 'subscribed');
const rsvpd = await pageAll(`/brands/${BRAND}/lists/${RSVP_ID}/contacts`);
const rsvpdIds = new Set(rsvpd.map((c) => c.contact_id));

console.log(`\ncontacts: ${everyone.length} total, ${subscribed.length} subscribed`);
console.log(`already RSVP'd for Nov 14: ${rsvpdIds.size}`);

const already = new Set((await pageAll(`/brands/${BRAND}/lists/${NOT_ID}/contacts`)).map((c) => c.contact_id));
const target = subscribed.filter((c) => !rsvpdIds.has(c.contact_id) && !already.has(c.contact_id));
console.log(`to seed into "not RSVP'd": ${target.length}`);

const ids = target.map((c) => c.contact_id);
for (let i = 0; i < ids.length; i += 50) {
  const batch = ids.slice(i, i + 50).map((contact_id) => ({ contact_id, lists: [NOT_ID] }));
  const r = await call(`/brands/${BRAND}/lists/contacts`, { method: 'POST', body: JSON.stringify(batch) });
  if (!r.ok) { console.error('  add failed', r.status, JSON.stringify(r.body).slice(0, 200)); break; }
  console.log(`  batch ${i / 50 + 1}: ok`);
}

const check = await pageAll(`/brands/${BRAND}/lists/${NOT_ID}/contacts`);
const overlap = check.filter((c) => rsvpdIds.has(c.contact_id));
console.log(`\n"${NOT_NAME}" (${NOT_ID}) holds ${check.length}`);
console.log(`overlap with the RSVP list: ${overlap.length} (must be 0 — nobody may get both texts)`);
console.log(`combined reach: ${check.length + rsvpdIds.size} of ${subscribed.length} subscribed`);

const usage = await call(`/brands/${BRAND}/usage`);
console.log(`credits available: ${usage.body && usage.body.credits_available} (nothing was spent here)`);

console.log(`\nPut these in api/join.js:`);
console.log(`  RSVP_LISTS      '010': ${RSVP_ID},`);
console.log(`  NOT_RSVPD_LISTS '010': ${NOT_ID},`);
