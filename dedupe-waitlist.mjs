// Finds and merges people who appear on the waitlist more than once.
//
// The waitlist node grew over time with mixed key formats — some rows are keyed by E.164
// (+19726897009), some by ten digits (9726897009). They are the same human, so the list shows
// them twice and they would get texted twice. My import deduped on the raw key, which does not
// catch that, so this normalises properly.
//
//   node dedupe-waitlist.mjs            report only
//   node dedupe-waitlist.mjs --write    merge them
//
// Merging keeps the row with the strongest provenance: a real website opt-in beats an import,
// and the earliest createdAt wins after that. Nothing is deleted without a surviving row.

const DB = 'https://set-apart-movement-default-rtdb.firebaseio.com';
const WRITE = process.argv.includes('--write');

function norm(raw) {
  const d = String(raw || '').replace(/[^0-9]/g, '');
  if (d.length === 11 && d[0] === '1') return d.slice(1);
  if (d.length === 10) return d;
  return null;
}

const waitlist = await (await fetch(`${DB}/waitlist.json`)).json() || {};
const keys = Object.keys(waitlist);
console.log(`waitlist rows: ${keys.length}`);

const byNumber = new Map();
const unparseable = [];
for (const k of keys) {
  const row = waitlist[k] || {};
  const n = norm(row.phone || k);
  if (!n) { unparseable.push(k); continue; }
  if (!byNumber.has(n)) byNumber.set(n, []);
  byNumber.get(n).push({ key: k, row });
}

const dupes = [...byNumber.entries()].filter(([, rows]) => rows.length > 1);
console.log(`distinct people:  ${byNumber.size}`);
console.log(`numbers appearing more than once: ${dupes.length}`);
console.log(`rows with an unusable number: ${unparseable.length}${unparseable.length ? ' -> ' + unparseable.join(', ') : ''}`);

// Website opt-in outranks an import; after that the oldest row wins.
const score = (e) => (e.row.source === 'imported' ? 0 : 2) + (e.row.smsConsent ? 1 : 0);
const pickKeeper = (rows) => [...rows].sort((a, b) =>
  score(b) - score(a) || (a.row.createdAt || 0) - (b.row.createdAt || 0))[0];

// Only merge when the names agree. "Trin" and "Trinity Scott" are one person; "Mondoe", "Test"
// and "Zion" on one number are not, and collapsing those would quietly delete somebody real.
// Anything that does not agree gets reported for a human to decide.
const firstName = (s) => String(s || '').trim().toLowerCase().split(/\s+/)[0] || '';
const sameHuman = (rows) => {
  const names = [...new Set(rows.map((r) => firstName(r.row.name)).filter(Boolean))];
  if (names.length <= 1) return true;
  return names.every((n) => names.every((m) => n.startsWith(m) || m.startsWith(n)));
};

const toDelete = [];
const renames = {};
const flagged = [];
for (const [n, rows] of dupes) {
  const names = rows.map((r) => `${r.row.name || '?'}[${r.row.source || 'site'}]`).join(' + ');
  if (!sameHuman(rows)) {
    flagged.push(`  ${n}  ${rows.length}x  ${names}`);
    continue;
  }
  const keep = pickKeeper(rows);
  // Carry over the fullest name and the highest meetup count before dropping the others.
  const best = rows.map((r) => r.row.name || '').sort((a, b) => b.length - a.length)[0];
  if (best && best !== keep.row.name) renames[keep.key] = best;
  toDelete.push(...rows.filter((r) => r.key !== keep.key).map((d) => d.key));
  console.log(`  ${n}  ${rows.length}x  ${names}  -> keeping "${best || keep.row.name}"`);
}

if (flagged.length) {
  console.log(`\nNOT merged — different people share these numbers, your call:`);
  flagged.forEach((f) => console.log(f));
}

console.log(`\nrows to remove: ${toDelete.length}`);
console.log(`names to improve on the surviving row: ${Object.keys(renames).length}`);
console.log(`waitlist after merge: ${keys.length - toDelete.length}`);

if (!WRITE) {
  console.log('\nREPORT ONLY — nothing changed. Re-run with --write to merge.');
} else {
  for (const [key, name] of Object.entries(renames)) {
    await fetch(`${DB}/waitlist/${key}.json`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    });
  }
  if (Object.keys(renames).length) console.log(`  improved ${Object.keys(renames).length} names`);

  // null removes a key in a Firebase PATCH.
  for (let i = 0; i < toDelete.length; i += 50) {
    const body = Object.fromEntries(toDelete.slice(i, i + 50).map((k) => [k, null]));
    const r = await fetch(`${DB}/waitlist.json`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error('delete failed HTTP ' + r.status);
    console.log(`  removed ${Math.min(i + 50, toDelete.length)}/${toDelete.length}`);
  }
  const after = await (await fetch(`${DB}/waitlist.json?shallow=true`)).json() || {};
  const recheck = new Set(Object.keys(after).map((k) => norm(k)).filter(Boolean));
  console.log(`\nwaitlist now holds ${Object.keys(after).length} rows, ${recheck.size} distinct numbers`);
  console.log(Object.keys(after).length === recheck.size ? 'no duplicates remain' : 'STILL DUPLICATED — look again');
}
