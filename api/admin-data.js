// Server-side only. Reads sensitive data (waitlist names/phone numbers, RSVP records) using a
// privileged Firebase credential that never reaches the browser, after checking a password that
// also never ships in any client-side file. This exists because Firebase Realtime Database rules
// for this project are currently public-read — the old client-side "isAdmin" flag only hid UI,
// it never actually restricted who could read the data (anyone could call the Firebase REST API
// directly, with no login, and get everything). Real protection has to happen at two points: this
// endpoint gates the DATA, and the Firebase rules (set in the Firebase console, not here) need to
// gate direct access to the database too. See ADMIN_SECURITY_SETUP.md in this repo.

const ALLOWED_RESOURCES = {
  waitlist: 'waitlist',
  rsvps: 'rsvps',
  smsOptIns: 'smsOptIns', // SMS opt-in form submissions (name, email, phone, consent record)
  bracelets: 'bracelets', // not sensitive (used for the public rankings feature) but served
                            // from here too so everything admin-facing goes through one path
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const password = req.headers['x-admin-password'] || req.query.password;
  const expected = process.env.ADMIN_PASSWORD;

  if (!expected) {
    res.status(500).json({ error: 'Server not configured: ADMIN_PASSWORD is not set.' });
    return;
  }
  if (!password || password !== expected) {
    res.status(403).json({ error: 'Wrong password.' });
    return;
  }

  const resource = ALLOWED_RESOURCES[req.query.resource];
  if (!resource) {
    res.status(400).json({ error: 'Unknown resource.' });
    return;
  }

  const dbSecret = process.env.FIREBASE_DB_SECRET;
  if (!dbSecret) {
    res.status(500).json({ error: 'Server not configured: FIREBASE_DB_SECRET is not set.' });
    return;
  }

  try {
    const url = `https://set-apart-movement-default-rtdb.firebaseio.com/${resource}.json?auth=${encodeURIComponent(dbSecret)}`;
    const r = await fetch(url);
    if (!r.ok) {
      res.status(502).json({ error: 'Firebase request failed.' });
      return;
    }
    const data = await r.json();
    res.status(200).json(data || {});
  } catch (err) {
    res.status(500).json({ error: 'Unexpected error reading Firebase.' });
  }
}
