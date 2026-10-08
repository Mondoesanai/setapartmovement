// Checks the Oct 17 sends for GSM-7 safety and credit cost before any of them go out.
import fs from 'fs';

const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ" +
  " !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§" +
  "¿abcdefghijklmnopqrstuvwxyzäöñüà";

const sends = [
  ['Send 1 - Mon Oct 12, all contacts',
   "Yo it's Sam. Set Apart Movement is back Sat Oct 17, 7-9pm, 2200 Driskell Dr. Free, bring a friend + a snack. setapartmovement.com Reply STOP to end"],
  ["Send 2A - Sat Oct 17 10am, RSVP'd",
   "Yo it's Sam. Tonight's the night. 7pm at 2200 Driskell Dr. You said you're in so we got a spot saved for you. Don't forget a snack to share. See you tonight."],
  ['Send 2B - Sat Oct 17 10am, did not RSVP',
   "Yo it's Sam. Set Apart Movement is tonight, 7-9pm at 2200 Driskell Dr. There's still room for you. Free, bring a friend. We'd love to see you there."],
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
