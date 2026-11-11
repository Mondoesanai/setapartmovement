// Brings the contacts that were imported into SlickText into the site's own waitlist, so the
// Admin > Waitlist tab is one list Mondoe can work straight down by hand.
//
//   node import-waitlist.mjs            dry run — prints exactly what would change
//   node import-waitlist.mjs --write    apply it
//
// Source is the CSVs in this repo, not the SlickText API: the API host does not resolve from
// this machine, and these files are what was loaded into SlickText in the first place, so they
// are the same data one step closer to the origin.
//
// CONSENT IS NOT FABRICATED. People who ticked the box on the website have smsConsent true and
// the exact wording they agreed to stored against them. Imported contacts never saw that box,
// so they are written with smsConsent false and a source that says where they came from. They
// are fine to text personally, one to one, from a phone; they are NOT a marketing audience, and
// nothing here pretends otherwise.

import fs from 'fs';

const DB = 'https://set-apart-movement-default-rtdb.firebaseio.com';
const WRITE = process.argv.includes('--write');

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift().map((h) => h.trim());
  return rows.filter((r) => r.some((v) => v.trim())).map((r) => {
    const o = {};
    header.forEach((h, i) => { o[h] = (r[i] || '').trim(); });
    return o;
  });
}

function normalizePhone(raw) {
  const d = String(raw || '').replace(/[^0-9]/g, '');
  if (d.length === 11 && d[0] === '1') return d.slice(1);
  if (d.length === 10) return d;
  return null;
}

function cleanName(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 60);
}

// Each source file, with the columns that hold a name, a number and a meetup count.
const SOURCES = [
  { file: 'slicktext-final.csv', name: 'FirstName', phone: 'Phone', meetups: 'Meetups', list: 'List' },
  { file: 'slicktext-import.csv', name: 'First Name', phone: 'Phone', meetups: 'Meetups' },
  { file: 'import-1-meetup-attendees.csv', name: 'First Name', phone: 'Mobile Number', meetups: 'Meetups Attended' },
  { file: 'import-2-invited.csv', name: 'First Name', phone: 'Mobile Number', meetups: 'Meetups Attended' },
  { file: 'waitlist-contacts.csv', name: 'First Name', phone: 'Phone', meetups: null },
];

const people = new Map();   // phone -> record
let readRows = 0, badPhones = 0;

for (const src of SOURCES) {
  if (!fs.existsSync(src.file)) { console.log(`  (missing) ${src.file}`); continue; }
  const rows = parseCsv(fs.readFileSync(src.file, 'utf8'));
  let used = 0;
  for (const r of rows) {
    readRows++;
    const phone = normalizePhone(r[src.phone]);
    if (!phone) { badPhones++; continue; }
    // 555-01xx is the reserved-for-fiction range — test data must never be imported.
    if (/^\d{3}555\d{4}$/.test(phone)) continue;
    const name = cleanName(r[src.name]);
    const meetups = src.meetups ? parseInt(r[src.meetups], 10) : NaN;
    const prev = people.get(phone);
    if (prev) {
      // Keep the fullest version of someone who appears in more than one file.
      if (!prev.name && name) prev.name = name;
      if (Number.isFinite(meetups) && meetups > (prev.meetupsAttended || 0)) prev.meetupsAttended = meetups;
    } else {
      people.set(phone, {
        phone, name,
        meetupsAttended: Number.isFinite(meetups) ? meetups : 0,
        from: src.file,
      });
      used++;
    }
  }
  console.log(`  ${src.file.padEnd(32)} ${String(rows.length).padStart(4)} rows, ${used} new`);
}

console.log(`\nrows read: ${readRows}, unusable phone numbers: ${badPhones}`);
console.log(`unique people in the files: ${people.size}`);

const existingWaitlist = await (await fetch(`${DB}/waitlist.json`)).json() || {};
const existingContacts = await (await fetch(`${DB}/contacts.json?shallow=true`)).json() || {};
const offset = await (await fetch(`${DB}/config/waitlistOffset.json`)).json();

const already = new Set(Object.keys(existingWaitlist));
const toAdd = [...people.values()].filter((p) => !already.has(p.phone));
const overlap = people.size - toAdd.length;

console.log(`\nalready on the site waitlist: ${already.size}`);
console.log(`  of those, also in the files: ${overlap} (left exactly as they are)`);
console.log(`new people to add:            ${toAdd.length}`);
console.log(`waitlist after import:        ${already.size + toAdd.length}`);

console.log(`\npublic counter`);
console.log(`  shows now:  ${(offset || 0) + already.size}  (${already.size} real + ${offset} placeholder)`);
console.log(`  the ${offset} placeholder stands in for exactly these people, so it has to come off`);
console.log(`  would show: ${already.size + toAdd.length}  (all real, no placeholder)`);

const withMeetups = toAdd.filter((p) => p.meetupsAttended > 0).length;
const noName = toAdd.filter((p) => !p.name).length;
console.log(`\nof the ${toAdd.length} being added: ${withMeetups} have attended a meetup before, ${noName} have no name`);

if (!WRITE) {
  console.log('\nDRY RUN — nothing written. Re-run with --write to apply.');
} else {

const now = Date.now();
const waitlistPatch = {}, contactsPatch = {};
for (const p of toAdd) {
  waitlistPatch[p.phone] = {
    name: p.name || 'Unknown',
    phone: p.phone,
    createdAt: now,
    // Honest: these people never saw the website consent box.
    smsConsent: false,
    source: 'imported',
  };
  contactsPatch[p.phone] = {
    name: p.name || 'Unknown',
    phone: p.phone,
    createdAt: now,
    lastSeenAt: now,
    meetupsAttended: p.meetupsAttended || 0,
    smsConsent: false,
    consentSource: 'imported from existing contact list — not a website opt-in',
    source: 'imported',
    importedFrom: p.from,
  };
}

const put = async (path, body) => {
  const r = await fetch(`${DB}/${path}.json`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${path} -> HTTP ${r.status}`);
};

console.log(`\nwriting ${toAdd.length} to waitlist and contacts...`);
const keys = Object.keys(waitlistPatch);
for (let i = 0; i < keys.length; i += 40) {
  const slice = keys.slice(i, i + 40);
  await put('waitlist', Object.fromEntries(slice.map((k) => [k, waitlistPatch[k]])));
  await put('contacts', Object.fromEntries(slice.map((k) => [k, contactsPatch[k]])));
  console.log(`  ${Math.min(i + 40, keys.length)}/${keys.length}`);
}

await put('config', { waitlistOffset: 0 });

const after = await (await fetch(`${DB}/waitlist.json?shallow=true`)).json() || {};
const afterOffset = await (await fetch(`${DB}/config/waitlistOffset.json`)).json();
console.log(`\nwaitlist now holds ${Object.keys(after).length}`);
console.log(`offset is now ${afterOffset} — the public counter shows the real number`);
}
