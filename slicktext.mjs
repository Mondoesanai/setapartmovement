// Small CLI for the SlickText account. Reads the key from .env.local (gitignored) so the
// credential is never typed into a shell command or written into any committed file.
//
//   node slicktext.mjs lists
//   node slicktext.mjs create-list "rsvp-008"
//   node slicktext.mjs list-contacts <listId>
//
// Nothing here sends a message. Sending is deliberately a separate, explicit step.

import fs from 'fs';

function loadEnv() {
  const txt = fs.readFileSync('.env.local', 'utf8');
  const out = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return out;
}

const env = loadEnv();
const KEY = env.SLICKTEXT_API_KEY;
const BRAND = env.SLICKTEXT_BRAND_ID;
if (!KEY || !BRAND) {
  console.error('Missing SLICKTEXT_API_KEY or SLICKTEXT_BRAND_ID in .env.local');
  process.exit(1);
}

const BASE = 'https://dev.slicktext.com/v1';

async function call(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${KEY}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 400); }
  return { status: res.status, ok: res.ok, body };
}

const [cmd, arg] = process.argv.slice(2);

if (cmd === 'lists') {
  const r = await call(`/brands/${BRAND}/lists`);
  console.log('HTTP', r.status);
  console.log(JSON.stringify(r.body, null, 2).slice(0, 3000));
} else if (cmd === 'create-list') {
  if (!arg) { console.error('need a list name'); process.exit(1); }
  const r = await call(`/brands/${BRAND}/lists`, {
    method: 'POST',
    body: JSON.stringify({ name: arg }),
  });
  console.log('HTTP', r.status);
  console.log(JSON.stringify(r.body, null, 2).slice(0, 2000));
} else if (cmd === 'list-contacts') {
  const r = await call(`/brands/${BRAND}/lists/${encodeURIComponent(arg)}/contacts`);
  console.log('HTTP', r.status);
  console.log(JSON.stringify(r.body, null, 2).slice(0, 3000));
} else if (cmd !== 'count') {
  console.log('usage: lists | create-list <name> | list-contacts <listId> | count <listId>');
}

// `node slicktext.mjs count <listId>` — pages through a list and reports how many are really in it.
if (cmd === 'count') {
  let page = 1, total = 0, names = [];
  while (page <= 20) {
    const r = await call(`/brands/${BRAND}/lists/${encodeURIComponent(arg)}/contacts?page=${page}&pageSize=100`);
    if (!r.ok) { console.log('HTTP', r.status, JSON.stringify(r.body).slice(0, 200)); break; }
    const rows = (r.body && r.body.data) || [];
    total += rows.length;
    for (const c of rows) names.push(c.first_name || '(no name)');
    const more = r.body && r.body.pagingData && r.body.pagingData.hasMore;
    if (!more || rows.length === 0) break;
    page++;
  }
  console.log('list ' + arg + ' -> ' + total + ' contacts');
  console.log('first 12: ' + names.slice(0, 12).join(', '));
}
