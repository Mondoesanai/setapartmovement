// Server-authoritative meetup gate.
//
// This endpoint is the only thing that decides what the homepage shows. Not the visitor's device
// clock, not a cron job, not anybody remembering to press Publish. The build ships both states —
// the announced meetup and the "next one isn't announced yet" waitlist — and this picks one.
//
// ---------------------------------------------------------------------------------------------
//                          THE ONLY BLOCK TO EDIT FOR A NEW MEETUP
// ---------------------------------------------------------------------------------------------
// Set `id` and `startsAt` and that is the whole clock change. Expiry is DERIVED, never typed:
// one hour after the meetup starts the site reverts to the waitlist on its own, so a meetup can
// never sit on the homepage as a stale invitation to something that already happened.
//
// `startsAt` is written in UTC on purpose. A local wall-clock string would silently depend on
// whichever timezone the serverless function happened to boot in. Conversions for Denton:
//   CDT (mid-March to 1 Nov)  = UTC-5  ->  7:00 PM becomes 00:00Z the NEXT day
//   CST (1 Nov to mid-March)  = UTC-6  ->  7:00 PM becomes 01:00Z the NEXT day
// 14 November 2026 is CST, so 7:00 PM Central = 2026-11-15T01:00:00Z.
//
// Set MEETUP to null when nothing is on the calendar; the site then shows the waitlist.
const MEETUP = {
  id: '010',
  title: 'CONNECT',
  startsAt: '2026-11-15T01:00:00Z', // Saturday 14 November 2026, 7:00 PM Central (CST)
};
// ---------------------------------------------------------------------------------------------

// How long after the start the invitation stays up. One hour, so somebody running late still
// sees where to go, and nobody arriving Sunday sees yesterday's event as "upcoming".
const EXPIRES_AFTER_START_MS = 60 * 60 * 1000;

function meetupClock() {
  if (!MEETUP || !MEETUP.startsAt) return null;
  const startsAt = Date.parse(MEETUP.startsAt);
  if (Number.isNaN(startsAt)) return null; // a typo must not take the site down
  return {
    id: MEETUP.id,
    title: MEETUP.title || null,
    startsAt,
    expiresAt: startsAt + EXPIRES_AFTER_START_MS,
    startsAtIso: new Date(startsAt).toISOString(),
    expiresAtIso: new Date(startsAt + EXPIRES_AFTER_START_MS).toISOString(),
  };
}

export default function handler(req, res) {
  // Must never be cached. A cached phase would pin visitors to whichever state the CDN happened
  // to store first — the exact failure this endpoint exists to prevent.
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const realNow = Date.now();

  const token = req.query && req.query.preview;
  const expected = process.env.PREVIEW_TOKEN;
  const isPreviewer = !!(token && expected && token === expected);

  // A test clock, so the flip can be proven immediately before, exactly at, and immediately
  // after the cutoff without waiting for the real date. Gated behind the preview token:
  // ungated, any visitor could hand themselves ?at=2027 and change what the site says.
  //
  // The token on its own does NOT change the phase. There is nothing to reveal early any more,
  // so a previewer sees exactly what everyone else sees unless they also pass a clock.
  let now = realNow;
  let mode = 'live';
  if (isPreviewer && req.query.at) {
    const parsed = Date.parse(req.query.at);
    if (!Number.isNaN(parsed)) {
      now = parsed;
      mode = 'test-clock';
    }
  } else if (isPreviewer) {
    mode = 'preview';
  }

  const meetup = meetupClock();
  const phase = meetup && now < meetup.expiresAt ? 'announced' : 'past';

  res.status(200).json({
    phase,
    meetup, // null when nothing is announced
    mode,
    // The server's clock, so the page can schedule the flip against real elapsed time instead
    // of trusting the device it is running on.
    now,
    serverTime: new Date(now).toISOString(),
    msUntilExpiry: meetup ? Math.max(0, meetup.expiresAt - now) : 0,
    // Kept so an older cached copy of the page still resolves to a sane state.
    released: phase === 'announced',
  });
}
