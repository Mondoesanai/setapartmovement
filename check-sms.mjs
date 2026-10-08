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
   "Today is the day! You already saved your spot so we are counting on you tonight. Everything you need is here: setapartmovement.com Cannot wait to see you!"],
  ['Send 2B - Sat Oct 17 9am, did not RSVP',
   "Today is the day! Set Apart Movement is tonight and there is still room for you. All the info is here: setapartmovement.com Hope to see you there!"],
];

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
  const ok = offenders.length === 0 && segments === 1 && inDoc;
  if (!ok) bad++;
  console.log(
    (ok ? 'PASS' : 'FAIL') + '  ' + label +
    '\n      chars=' + len + '  segments=' + segments +
    '  non-GSM7=' + (offenders.length ? JSON.stringify(offenders) : 'none') +
    '  matches doc=' + inDoc
  );
}
const contacts = 110;
console.log('\nCredit estimate at ' + contacts + ' contacts:');
console.log('  Send 1 to everyone:      ' + contacts + ' credits');
console.log('  Send 2 split (2A + 2B):  ' + contacts + ' credits');
console.log('  Total for Oct 17:        ' + contacts * 2 + ' credits');
process.exit(bad ? 1 : 0);
