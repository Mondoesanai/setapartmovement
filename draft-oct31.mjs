// Validates the Oct 31 drafts against the live credit balance. Nothing here sends.
// 1 credit = 160 chars; past that each part is 153.

const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ" +
  " !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§" +
  "¿abcdefghijklmnopqrstuvwxyzäöñüà";

const CREDITS_AVAILABLE = 210; // live from /brands/36457/usage
const BILLABLE = 112;          // what the Oct 17 sends actually billed (107 + 5)

const drafts = [
  {
    label: 'SEND 1 - today (Mon Oct 26) -> everyone',
    body:
      "YOOO this is Mondoe. Our next meetup is this Saturday, Oct 31, 6-8pm at Denton Town Square. " +
      "Free. Would love for you to be there. setapartmovement.com for more info",
    audience: BILLABLE,
  },
  {
    label: 'SEND 2 - Sat Oct 31, 9am -> everyone (no split)',
    body:
      "TODAY'S THE DAY! Set Apart Movement is tonight, 6-8pm at Denton Town Square. Still room for " +
      "you, pull up. setapartmovement.com for more info",
    audience: BILLABLE,
  },
];

let bad = 0;
let total = 0;
for (const d of drafts) {
  const offenders = [...d.body].filter((ch) => !GSM7.includes(ch));
  const len = d.body.length;
  const seg = len <= 160 ? 1 : Math.ceil(len / 153);
  const cost = seg * d.audience;
  total += cost;
  const ok = offenders.length === 0 && seg === 1;
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'OVER'}  ${d.label}`);
  console.log(`      chars=${len}/160  credits/person=${seg}  audience=${d.audience}  cost=${cost}`);
  if (offenders.length) console.log(`      NON-GSM7: ${JSON.stringify(offenders)}`);
  console.log(`      "${d.body}"`);
  console.log('');
}

console.log('--- budget ---');
console.log(`  available : ${CREDITS_AVAILABLE}`);
console.log(`  plan cost : ${total}`);
console.log(`  ${total <= CREDITS_AVAILABLE
  ? 'FITS, ' + (CREDITS_AVAILABLE - total) + ' left over'
  : 'SHORT BY ' + (total - CREDITS_AVAILABLE) + ' - send 1 fits, send 2 runs out partway'}`);
console.log(`\n  if only send 1 goes today: ${CREDITS_AVAILABLE - drafts[0].audience} credits left for Saturday,`);
console.log(`  which covers ${Math.min(CREDITS_AVAILABLE - drafts[0].audience, BILLABLE)} of ${BILLABLE} people.`);
console.log(bad ? `\n${bad} OVER BUDGET` : '\nBoth drafts are one credit and GSM-7 safe.');
