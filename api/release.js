// Server-authoritative release gate for the BE THE LIGHT reveal.
//
// The whole point is that the switchover does not depend on a visitor's device clock, on anyone
// pressing Publish, or on a future build finishing. Both event configurations ship in the same
// deployed build; this endpoint is the only thing that decides which one a visitor sees.
//
// Release: Saturday 17 October 2026, 8:00 PM America/Chicago.
// Central is UTC-5 on that date (CDT runs until 1 November), so that is 2026-10-18T01:00:00Z.
// The constant below is stored in UTC on purpose — writing it as a local wall-clock string would
// make it depend on whatever timezone the server happened to be in.
const RELEASE_AT = Date.parse('2026-10-18T01:00:00Z');

export default function handler(req, res) {
  // Must never be cached: a cached "not yet released" would pin a visitor to the old event.
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const realNow = Date.now();

  const token = req.query && req.query.preview;
  const expected = process.env.PREVIEW_TOKEN;
  const isPreviewer = !!(token && expected && token === expected);

  // A test clock, so the gate can be proven immediately before, exactly at, and immediately after
  // the deadline without waiting for it. Gated behind the preview token: without that check an
  // ordinary visitor could hand themselves ?at=2027 and see the reveal early.
  let now = realNow;
  let mode = 'live';
  if (isPreviewer && req.query.at) {
    const parsed = Date.parse(req.query.at);
    if (!Number.isNaN(parsed)) {
      now = parsed;
      mode = 'test-clock';
    }
  }

  // `released` is the answer the page acts on. A previewer with no test clock simply sees the
  // upcoming version early; that is the private preview.
  let released = now >= RELEASE_AT;
  if (isPreviewer && mode === 'live') {
    released = true;
    mode = 'preview';
  }

  res.status(200).json({
    released,
    mode,
    // Server clock, so the page can schedule the flip against real elapsed time rather than
    // trusting the device.
    now,
    releaseAt: RELEASE_AT,
    msUntilRelease: Math.max(0, RELEASE_AT - now),
    serverTime: new Date(now).toISOString(),
    releaseTime: new Date(RELEASE_AT).toISOString(),
  });
}
