// Validates the two Nov 14 drafts before anyone approves them. Sends nothing.
//
// 1 credit = 160 characters, but ONLY if every character is in the GSM-7 alphabet. One curly
// quote, em-dash or emoji silently drops the limit to 70 and doubles the bill for every person.
// A message at 164 characters has cost double before on this account.

const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ" +
  " !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§" +
  "¿abcdefghijklmnopqrstuvwxyzäöñüà";

// Best estimate of who would actually receive these. SlickText cannot be queried from this
// machine, so this is the Firebase figure; confirm against the real list before sending.
const AUDIENCE = 138;
const CREDITS_AVAILABLE = 96;

const drafts = [
  {
    when: 'SEND 1 — today (Tue 11 Nov), to everyone',
    body: "YOOO this is Mondoe. Set Apart Movement is THIS SATURDAY 7-9pm in Corinth. Would love to have you there. Everything you need: setapartmovement.com",
  },
  {
    when: 'SEND 2 — Saturday 14 Nov, 9am, to everyone',
    body: "TODAY'S THE DAY! Set Apart Movement is tonight 7-9pm in Corinth. RSVP if you haven't yet. Would love to see you there. setapartmovement.com",
  },
];

let total = 0;
for (const d of drafts) {
  const bad = [...d.body].filter((c) => !GSM7.includes(c));
  const len = d.body.length;
  const segments = len <= 160 ? 1 : Math.ceil(len / 153);
  const cost = segments * AUDIENCE;
  total += cost;
  console.log(`${d.when}`);
  console.log(`  "${d.body}"`);
  console.log(`  ${len}/160 chars | ${segments} credit${segments > 1 ? 's' : ''} per person | ${cost} credits`);
  if (bad.length) console.log(`  NOT GSM-7: ${JSON.stringify(bad)} -> would bill double`);
  else console.log(`  GSM-7 clean`);
  console.log('');
}

console.log('--- budget ---');
console.log(`  audience (estimate):  ${AUDIENCE}`);
console.log(`  both sends cost:      ${total}`);
console.log(`  credits available:    ${CREDITS_AVAILABLE}`);
console.log(total <= CREDITS_AVAILABLE
  ? `  fits, ${CREDITS_AVAILABLE - total} left over`
  : `  SHORT BY ${total - CREDITS_AVAILABLE} — needs a top-up before either send`);
console.log(`\n  one send alone costs ${total / 2}, so even send 1 is ${total / 2 - CREDITS_AVAILABLE > 0
  ? (total / 2 - CREDITS_AVAILABLE) + ' over' : 'affordable'}.`);
