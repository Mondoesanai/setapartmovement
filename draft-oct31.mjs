// Validates the Oct 31 drafts before anything is scheduled. Nothing here sends.
// Budget is 2 credits: 1 credit = 160 chars, beyond that each part is 153, so 306 max.

const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ" +
  " !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§" +
  "¿abcdefghijklmnopqrstuvwxyzäöñüà";

const drafts = [
  {
    label: 'MESSAGE 1 - today (Mon Oct 26), to everyone (114)',
    body:
      "YOOO this is Mondo. Our next Set Apart Movement meetup is THIS SATURDAY, Oct 31, 6-8pm at " +
      "Denton Town Square. We're walking downtown together to pray for people and share some hope. " +
      "It's free, bring whoever. Would love to see you there: setapartmovement.com Reply STOP to end",
    audience: 114,
  },
  {
    label: "MESSAGE 2A - Sat Oct 31, 9am, to people who RSVP'd (3 so far)",
    body:
      "YOOO it's Mondo. Today is the day! 6pm at Denton Town Square. You already said you're in so " +
      "we're counting on you tonight. Wear comfy shoes, we're walking. Grab somebody and bring them " +
      "with you: setapartmovement.com",
    audience: 3,
  },
  {
    label: 'MESSAGE 2B - Sat Oct 31, 9am, to everyone else (111)',
    body:
      "YOOO it's Mondo. Today is the day! Set Apart Movement is tonight, 6-8pm at Denton Town Square. " +
      "There's still room for you, no RSVP needed, just pull up. Wear comfy shoes, we're walking " +
      "downtown. Would really love to see you: setapartmovement.com",
    audience: 111,
  },
];

let bad = 0;
let credits = 0;
for (const d of drafts) {
  const offenders = [...d.body].filter((ch) => !GSM7.includes(ch));
  const len = d.body.length;
  const seg = len <= 160 ? 1 : Math.ceil(len / 153);
  const ok = offenders.length === 0 && seg <= 2;
  if (!ok) bad++;
  credits += seg * d.audience;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${d.label}`);
  console.log(`      chars=${len}  credits/person=${seg}  non-GSM7=${offenders.length ? JSON.stringify(offenders) : 'none'}`);
  console.log(`      "${d.body}"`);
  console.log('');
}
console.log('Credit cost if all three go out: ' + credits);
console.log(bad ? bad + ' PROBLEM(S)' : 'All drafts are within budget and GSM-7 safe.');
