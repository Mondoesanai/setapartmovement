// One door into the text funnel.
//
// Both the "text me when the next one drops" form and the RSVP form post here. The point is that
// there is exactly ONE contact record per phone number, living in Firebase, that everything else
// reads from. SlickText is only the thing that sends the message — it is not the source of truth.
// That way a person who RSVPs twice, or who joined the list in August and RSVPs in October, is
// still one human with one history, not three rows in three systems.
//
// Consent is mandatory here. The endpoint rejects a submission without it rather than storing an
// un-textable record, because a contact we are not allowed to text is worse than no contact — it
// looks like growth while doing nothing.

const DB = 'https://set-apart-movement-default-rtdb.firebaseio.com';
const SLICKTEXT_BASE = 'https://dev.slicktext.com/v1';

// The exact wording a person agrees to. Stored verbatim on the record so there is a dated,
// per-person proof of opt-in if a carrier ever asks for it.
const CONSENT_TEXT =
  'I agree to get texts from Set Apart Movement about upcoming meetups. Message frequency varies. ' +
  'Message & data rates may apply. Reply STOP to unsubscribe, HELP for help.';

function dbUrl(path) {
  const secret = process.env.FIREBASE_DB_SECRET;
  return `${DB}/${path}.json` + (secret ? `?auth=${encodeURIComponent(secret)}` : '');
}

// US 10-digit. Strips punctuation and a leading country code so the same human typed three
// different ways ("940-453-4046", "(940) 4534046", "+1 940 453 4046") lands on one record.
function normalizePhone(raw) {
  const digits = String(raw || '').replace(/[^0-9]/g, '');
  if (digits.length === 11 && digits[0] === '1') return digits.slice(1);
  if (digits.length === 10) return digits;
  return null;
}

function cleanName(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 60);
}

async function readContact(phone) {
  const r = await fetch(dbUrl(`contacts/${phone}`));
  if (!r.ok) throw new Error('db read failed');
  return await r.json();
}

async function writeContact(phone, data) {
  const r = await fetch(dbUrl(`contacts/${phone}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error('db write failed');
}

// Best-effort push into SlickText. A failure here must never cost us the signup — the person is
// already safely in Firebase by this point, so we record that the sync is owed and move on.
// `pendingSync` is what a later reconcile pass looks for.
async function syncToSlickText({ phone, name, listKey }) {
  const key = process.env.SLICKTEXT_API_KEY;
  const brand = process.env.SLICKTEXT_BRAND_ID;
  if (!key || !brand) return { ok: false, reason: 'not configured' };

  const r = await fetch(`${SLICKTEXT_BASE}/contacts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      brand_id: Number(brand),
      mobile_number: phone,
      first_name: name,
      lists: listKey ? [listKey] : undefined,
    }),
  });
  if (!r.ok) return { ok: false, reason: `slicktext ${r.status}` };
  return { ok: true };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const name = cleanName(body.name);
  const phone = normalizePhone(body.phone);
  const kind = body.kind === 'rsvp' ? 'rsvp' : 'list';
  const meetupId = String(body.meetupId || '').slice(0, 12) || null;

  if (!name) { res.status(400).json({ error: 'Please enter your name.' }); return; }
  if (!phone) { res.status(400).json({ error: 'That phone number does not look right.' }); return; }
  if (body.consent !== true) {
    res.status(400).json({ error: 'Please check the box so we can text you.' });
    return;
  }

  const now = Date.now();

  try {
    const existing = await readContact(phone);
    const isNew = !existing;

    // Fields we set on every submission, new or returning.
    const patch = {
      name: existing && existing.name ? existing.name : name,
      phone,
      lastSeenAt: now,
      smsConsent: true,
      consentText: CONSENT_TEXT,
      consentSource: `setapartmovement.com ${kind === 'rsvp' ? 'RSVP form' : 'text-list form'}`,
      consentAt: existing && existing.consentAt ? existing.consentAt : now,
    };

    if (isNew) {
      patch.createdAt = now;
      patch.source = kind === 'rsvp' ? 'rsvp' : 'website';
      patch.meetupsAttended = 0;
      if (body.ref) patch.ref = String(body.ref).slice(0, 24);
    }

    // RSVP is a separate fact from attendance. We record that they said they are coming; whether
    // they actually showed up is set later from the check-in screen. Keeping these apart is what
    // stops "meetups attended" from inflating every time someone taps a button.
    if (kind === 'rsvp' && meetupId) {
      patch[`rsvps/${meetupId}`] = now;
    }

    await writeContact(phone, patch);

    // The live "people getting the text" counter and the existing admin view both read `waitlist`,
    // so mirror a light record there to keep them accurate. Keyed by phone rather than a push id,
    // which means signing up twice updates one row instead of inflating the number.
    await fetch(dbUrl(`waitlist/${phone}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: patch.name,
        phone,
        createdAt: (existing && existing.createdAt) || now,
        smsConsent: true,
        source: kind,
      }),
    }).catch(() => {});

    // Everyone lands in the main list. RSVPs additionally get tagged for the day-of send, so the
    // "see you in a few hours" text only goes to people who actually said they were coming.
    const listKey = kind === 'rsvp' && meetupId ? `rsvp-${meetupId}` : 'all';
    const sync = await syncToSlickText({ phone, name: patch.name, listKey });
    if (!sync.ok) {
      await writeContact(phone, { pendingSync: true, pendingSyncReason: sync.reason });
    }

    res.status(200).json({
      ok: true,
      isNew,
      name: patch.name,
      meetupsAttended: (existing && existing.meetupsAttended) || 0,
      synced: sync.ok,
    });
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong — try again.' });
  }
}
