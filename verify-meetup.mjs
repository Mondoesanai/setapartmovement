// Static checks on index.html + api/release.js. No browser, no network.
//
// The one that matters most is the drift check: the hero carries a copy of the meetup dates as an
// offline fallback, and if that copy ever disagrees with api/release.js the site would show one
// thing online and another thing offline. Everything else here is a guard against the kind of
// stale content that has shipped before — a past event's date left in the metadata.

import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8');
const api = fs.readFileSync('api/release.js', 'utf8');

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail !== undefined ? '  (' + detail + ')' : ''}`);
};

console.log('--- api/release.js is the clock ---');
const apiId = (api.match(/id:\s*'([^']+)'/) || [])[1];
const apiStart = (api.match(/startsAt:\s*'([^']+)'/) || [])[1];
const apiWindow = Number((api.match(/EXPIRES_AFTER_START_MS\s*=\s*([\d\s*]+);/) || [])[1]
  ? eval((api.match(/EXPIRES_AFTER_START_MS\s*=\s*([\d\s*]+);/) || [])[1])
  : NaN);
check('meetup id present', !!apiId, apiId);
check('startsAt parses', !!apiStart && !Number.isNaN(Date.parse(apiStart)), apiStart);
check('expiry window is one hour', apiWindow === 3600000, apiWindow + 'ms');
const apiExpiry = Date.parse(apiStart) + apiWindow;

console.log('\n--- the hero fallback agrees with it ---');
const heroTag = (html.match(/<div id="hero-event"[\s\S]{0,400}?>/) || [])[0] || '';
const attr = (n) => (heroTag.match(new RegExp(n + '="([^"]+)"')) || [])[1];
check('data-meetup-id matches api', attr('data-meetup-id') === apiId, `${attr('data-meetup-id')} vs ${apiId}`);
check('data-starts-at matches api', Date.parse(attr('data-starts-at')) === Date.parse(apiStart), attr('data-starts-at'));
check('data-expires-at is start + 1h', Date.parse(attr('data-expires-at')) === apiExpiry,
  `${attr('data-expires-at')} vs ${new Date(apiExpiry).toISOString()}`);

console.log('\n--- both phases exist and both start hidden ---');
check('#hero-event ships hidden', /<div id="hero-event" hidden/.test(html));
check('#hero-tba ships hidden', /<div id="hero-tba" hidden>/.test(html));
check('retired #hero-belight is gone', !html.includes('hero-belight'));
check('#waitlist-mode stub kept for legacy scripts', /<div id="waitlist-mode" hidden><\/div>/.test(html));
// Regions a visitor can actually see, or a crawler reads as content. Everything else in the file
// is CSS, or script bodies belonging to date-expired blocks that no longer run.
const region = (open, close) => {
  const a = html.indexOf(open);
  if (a < 0) return '';
  const b = html.indexOf(close, a);
  return b < 0 ? html.slice(a) : html.slice(a, b + close.length);
};
const headHtml = region('<head>', '</head>');
const eventHtml = region('<div id="hero-event"', '/#hero-event -->');
const tbaHtml = region('<div id="hero-tba"', '/#hero-tba -->');
const introHtml = region('<div id="intro-light"', '</div>\r\n\r\n<!-- INVITE PAGE -->');
const visible = headHtml + eventHtml + tbaHtml + introHtml;

check('waitlist card lives inside #hero-tba', tbaHtml.includes('wl-headline'));
check('waitlist card has no dismiss button', !tbaHtml.includes('dismissWlCard()'));
check('waitlist card has no admin plus button', !tbaHtml.includes('openWlAdmin()'));

console.log('\n--- the gate can find everything it reaches for ---');
for (const id of ['mt-cd-days', 'mt-cd-hrs', 'mt-cd-mins', 'mt-cd-secs', 'mt-rsvp-btn',
                  'intro-light', 'wl-count', 'wl-join-btn']) {
  check(`#${id} exists`, html.includes(`id="${id}"`));
}
check('envelope entrance is no longer replayed', !/if \(!st\.released\) runSequence\(\)/.test(html));
check('countdown ids are not the retired bl- ones', !html.includes('bl-cd-days'));

console.log('\n--- structured data is this meetup, not a past one ---');
const ld = (html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1];
let graph = null;
try { graph = JSON.parse(ld)['@graph']; check('JSON-LD parses', true); }
catch (e) { check('JSON-LD parses', false, e.message); }
if (graph) {
  const ev = graph.find((n) => n['@type'] === 'Event');
  check('Event node present', !!ev);
  if (ev) {
    check('Event starts 2026-11-14 19:00 -06:00', ev.startDate === '2026-11-14T19:00:00-06:00', ev.startDate);
    check('Event start matches the api clock', Date.parse(ev.startDate) === Date.parse(apiStart));
    check('Event location is Corinth', ev.location.address.addressLocality === 'Corinth');
    check('no dead Tally RSVP url', ev.offers.url !== 'https://tally.so/r/zx9581', ev.offers.url);
  }
  const faq = graph.find((n) => n['@type'] === 'FAQPage');
  const next = faq && faq.mainEntity.find((q) => /next Set Apart Movement meetup/.test(q.name));
  check('FAQ answers with November 14', !!next && next.acceptedAnswer.text.includes('November 14, 2026'));
}

console.log('\n--- no past meetup left in the head or either hero ---');
// #hero-legacy keeps its own historical copy on purpose and is permanently display:none, and the
// retired per-meetup scripts still carry old date strings in bodies that never execute. Neither
// reaches a visitor, so neither is in scope here. Rendered text is checked in the browser pass.
for (const stale of ['BE THE LIGHT', 'Denton Town Square', 'October 31', 'September 19',
                     'North East Mall', 'July 25', 'Meetup 006', 'Meetup 007', 'Meetup 009',
                     'tally.so/r/zx9581', 'Oct 3', 'Sept 19']) {
  const n = visible.split(stale).length - 1;
  check(`"${stale}" absent`, n === 0, n ? n + ' hit(s)' : undefined);
}
check('retired bl- classes fully gone', !html.includes('class="bl-'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
