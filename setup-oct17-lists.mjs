// Sets up the two mutually exclusive buckets the Saturday send needs.
//
// SlickText campaigns can target lists but cannot EXCLUDE one, so "everyone who did not RSVP"
// has to exist as its own list rather than being computed at send time. This seeds that list
// with everyone currently in the account; /api/join then moves people out of it and into
// "RSVP Oct 17" as they reserve a spot, so the two never overlap and nobody gets both texts.
//
// Safe to re-run: adding a contact to a list it is already in is a no-op.

import fs from 'fs';

const env = {};
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const KEY = env.SLICKTEXT_API_KEY;
const BRAND = env.SLICKTEXT_BRAND_ID;
const BASE = 'https://dev.slicktext.com/v1';

const SOURCE_LISTS = [183765, 183766]; // Meetup Attendees, Invited
const NOT_RSVPD = Number(process.argv[2]);
if (!NOT_RSVPD) { console.error('usage: node setup-oct17-lists.mjs <notRsvpdListId>'); process.exit(1); }

async function call(path, opts = {}) {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: {
      Authorization: 'Bearer ' + KEY,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const t = await r.text();
  let b; try { b = JSON.parse(t); } catch { b = t.slice(0, 300); }
  return { status: r.status, ok: r.ok, body: b };
}

// Paging is 0-indexed and pageSize is required whenever page is given.
async function allContacts(listId) {
  const out = [];
  for (let page = 0; page < 20; page++) {
    const r = await call(`/brands/${BRAND}/lists/${listId}/contacts?page=${page}&pageSize=100`);
    if (!r.ok) { console.error('read failed', listId, r.status); break; }
    const rows = (r.body && r.body.data) || [];
    out.push(...rows);
    if (!(r.body.pagingData && r.body.pagingData.hasMore) || rows.length === 0) break;
  }
  return out;
}

const seen = new Map();
for (const id of SOURCE_LISTS) {
  const rows = await allContacts(id);
  console.log(`list ${id}: ${rows.length} contacts`);
  for (const c of rows) seen.set(c.contact_id, c.first_name || '?');
}
console.log(`unique people across both: ${seen.size}`);

const ids = [...seen.keys()];
const CHUNK = 50;
let added = 0;
for (let i = 0; i < ids.length; i += CHUNK) {
  const batch = ids.slice(i, i + CHUNK).map((contact_id) => ({ contact_id, lists: [NOT_RSVPD] }));
  const r = await call(`/brands/${BRAND}/lists/contacts`, { method: 'POST', body: JSON.stringify(batch) });
  if (!r.ok) { console.error('  add failed', r.status, JSON.stringify(r.body).slice(0, 200)); break; }
  added += (r.body && r.body.count) || batch.length;
  console.log(`  added batch ${i / CHUNK + 1}: ${JSON.stringify(r.body)}`);
}

const check = await allContacts(NOT_RSVPD);
console.log(`\n"not RSVPd" list ${NOT_RSVPD} now holds ${check.length} contacts (reported added: ${added})`);
