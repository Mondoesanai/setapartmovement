// Checks the Oct 17 sends for GSM-7 safety and credit cost before any of them go out.
import fs from 'fs';

const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ" +
  " !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§" +
  "¿abcdefghijklmnopqrstuvwxyzäöñüà";

const sends = [
  ['Send 1 - Mon Oct 12 9am, all contacts',
   "Hey! Set Apart Movement is back this Saturday night and we would love to have you there. All the info is here: setapartmovement.com Reply STOP to end"],
  ["Send 2A - Sat Oct 17 9am, RSVP'd",
   "Yo! Today is the day. Set Apart Movement is tonight and I'm hyped you said you're in. Your spot is saved. If you can, grab somebody and bring them with you, that's what makes these nights hit different. All the info: setapartmovement.com See you tonight!"],
  ['Send 2B - Sat Oct 17 9am, did not RSVP',
   "Yo! Today is the day. Set Apart Movement is tonight and there's still room for you. No RSVP needed, no cost, just pull up. Bring a friend if you can. It's always better when more of us are in the room: setapartmovement.com Hope to see you!"],
];

// Budget is 2 credits per message now. One credit is 160 chars; past that each part is 153.
const MAX_CREDITS = 2;

const md = fs.readFileSync('TEXT-MESSAGES.md', 'utf8');
// The doc wraps long lines for readability and quotes them as blockquotes, so strip the "> "
// markers and collapse whitespace before comparing.
const flat = md
  .split('\n')
  .map((l) => l.replace(/^\s*>\s?/, ''))
  .join(' ')
  .replace(/\s+/g, ' ');

let bad = 0;
for (const [label, msg] of sends) {
  const offenders = [...msg].filter((ch) => !GSM7.includes(ch));
  const len = msg.length;
  const segments = len <= 160 ? 1 : Math.ceil(len / 153);
  const inDoc = flat.includes(msg.replace(/\s+/g, ' '));
  const ok = offenders.length === 0 && segments <= MAX_CREDITS && inDoc;
  if (!ok) bad++;
  console.log(
    (ok ? 'PASS' : 'FAIL') + '  ' + label +
    '\n      chars=' + len + '  segments=' + segments +
    '  non-GSM7=' + (offenders.length ? JSON.stringify(offenders) : 'none') +
    '  matches doc=' + inDoc
  );
}
// Each person receives exactly one of 2A / 2B, so the Saturday cost is per-person segments,
// not the sum of both messages.
const contacts = 110;
const seg = (m) => (m.length <= 160 ? 1 : Math.ceil(m.length / 153));
const mon = seg(sends[0][1]);
const sat = Math.max(seg(sends[1][1]), seg(sends[2][1]));
console.log('\nCredit estimate at ' + contacts + ' subscribed contacts:');
console.log('  Mon Oct 12 (' + mon + ' credit/person):   ' + contacts * mon);
console.log('  Sat Oct 17 (' + sat + ' credits/person):  ' + contacts * sat);
console.log('  Total for this meetup:      ' + contacts * (mon + sat));
process.exit(bad ? 1 : 0);
