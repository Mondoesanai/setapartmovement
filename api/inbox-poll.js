// Hourly inbox poller. Runs on Vercel Cron, so it keeps working with every laptop in the house
// shut off.
//
// What it does: reads new inbound texts, writes them to Firebase so nothing is ever lost, and
// answers a small fixed set of commands. What it deliberately does NOT do: run arbitrary
// instructions received by SMS. Caller ID on a text is trivially forged, this account can message
// 111 minors, and an endpoint that executed whatever arrived would hand that ability to anyone who
// learned the number. Anything that is not a known command is stored with status "queued" and
// answered with an acknowledgement, for a human to action.

const DB = 'https://set-apart-movement-default-rtdb.firebaseio.com';
const SLICKTEXT_BASE = 'https://dev.slicktext.com/v1';

const OWNER = '+18179833004';
const ADMIN_LIST = 183786; // "Admin - Mondoe only" — one contact, checked before every reply

function dbUrl(path) {
  const secret = process.env.FIREBASE_DB_SECRET;
  return `${DB}/${path}.json` + (secret ? `?auth=${encodeURIComponent(secret)}` : '');
}

async function st(path, options = {}) {
  const r = await fetch(`${SLICKTEXT_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.SLICKTEXT_API_KEY}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = null; }
  return { ok: r.ok, status: r.status, body };
}

async function countList(brand, id) {
  let total = 0;
  for (let p = 0; p < 20; p++) {
    const r = await st(`/brands/${brand}/lists/${id}/contacts?page=${p}&pageSize=100`);
    const rows = (r.body && r.body.data) || [];
    total += rows.length;
    if (!(r.body && r.body.pagingData && r.body.pagingData.hasMore) || rows.length === 0) break;
  }
  return total;
}

// Replies go out as a campaign to the admin list. The size is re-checked every single time, so a
// reply can never fan out to the real audience even if that list were edited.
async function replyToOwner(brand, message) {
  const size = await countList(brand, ADMIN_LIST);
  if (size !== 1) return { ok: false, reason: `admin list has ${size} contacts, refusing` };
  const body = message.length > 300 ? message.slice(0, 297) + '...' : message;
  const r = await st(`/brands/${brand}/campaigns`, {
    method: 'POST',
    body: JSON.stringify({
      name: `Auto-reply ${new Date().toISOString().slice(0, 16)}`,
      body,
      status: 'send',
      audience: { contact_lists: [ADMIN_LIST] },
    }),
  });
  return { ok: r.ok, status: r.status };
}

async function buildStatus(brand) {
  const [rsvpd, notRsvpd, signups] = await Promise.all([
    countList(brand, 183781),
    countList(brand, 183783),
    countList(brand, 183782),
  ]);
  const camps = await st(`/brands/${brand}/campaigns`);
  const scheduled = ((camps.body && camps.body.data) || []).filter((c) => c.status === 'scheduled');
  return (
    `RSVPd: ${rsvpd}. Not RSVPd: ${notRsvpd}. Site signups: ${signups}. ` +
    `Scheduled sends: ${scheduled.length}` +
    (scheduled.length ? ' (' + scheduled.map((c) => c.scheduled.slice(5, 16)).join(', ') + ' UTC)' : '')
  );
}

// Cancels every scheduled campaign. Fail-safe by nature: the worst case is that texts do not go
// out, which is recoverable, unlike texts that should not have gone out.
async function pauseSends(brand) {
  const camps = await st(`/brands/${brand}/campaigns`);
  const scheduled = ((camps.body && camps.body.data) || []).filter((c) => c.status === 'scheduled');
  const cancelled = [];
  for (const c of scheduled) {
    const d = await st(`/brands/${brand}/campaigns/${c.campaign_id}`, { method: 'DELETE' });
    if (d.ok) cancelled.push(`${c.name} [${c.body.slice(0, 60)}]`);
  }
  await fetch(dbUrl('config/cancelledCampaigns'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ at: Date.now(), items: cancelled }),
  }).catch(() => {});
  return cancelled.length;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  // Vercel Cron sends this header when CRON_SECRET is configured. This fails CLOSED on purpose:
  // if the secret is missing the endpoint refuses to run at all, rather than becoming a public
  // button that reads the inbox, sends texts and cancels campaigns.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    res.status(503).json({ error: 'CRON_SECRET is not set; refusing to run unauthenticated.' });
    return;
  }
  if ((req.headers.authorization || '') !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const brand = process.env.SLICKTEXT_BRAND_ID;
  if (!brand || !process.env.SLICKTEXT_API_KEY) {
    res.status(500).json({ error: 'SlickText not configured' });
    return;
  }

  try {
    const lastRes = await fetch(dbUrl('config/inboxLastPoll'));
    const last = (await lastRes.json()) || 0;

    const msgs = await st(`/brands/${brand}/messages?direction=incoming`);
    const rows = (msgs.body && msgs.body.data) || [];

    // created_micro is a unix float; it is the only ordering we can trust across pages.
    const fresh = rows
      .filter((m) => (m.created_micro || 0) * 1000 > last)
      .sort((a, b) => (a.created_micro || 0) - (b.created_micro || 0));

    const handled = [];
    let newest = last;

    for (const m of fresh) {
      const ts = Math.round((m.created_micro || 0) * 1000);
      if (ts > newest) newest = ts;

      const text = String(m.body || '').trim();
      const fromOwner = m.from === OWNER;
      const cmd = text.toUpperCase();

      let action = 'stored';
      let reply = null;

      if (fromOwner) {
        if (cmd === 'STATUS') {
          reply = await buildStatus(brand);
          action = 'status';
        } else if (cmd === 'COUNT') {
          reply = await buildStatus(brand);
          action = 'count';
        } else if (cmd === 'PAUSE' || cmd === 'STOP SENDS' || cmd === 'CANCEL') {
          const n = await pauseSends(brand);
          reply = `Cancelled ${n} scheduled send(s). Nothing will go out until they are rebuilt. Text STATUS to confirm.`;
          action = 'paused';
        } else if (cmd === 'HELP' || cmd === 'COMMANDS') {
          reply = 'Commands: STATUS (counts + scheduled sends), PAUSE (cancel all scheduled sends), HELP. Anything else is saved for Claude to pick up next session.';
          action = 'help';
        } else {
          reply = 'Got it, saved. Claude will see this next session. For something now, text STATUS, PAUSE or HELP.';
          action = 'queued';
        }
      }

      await fetch(dbUrl(`inbox/${m._id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: m.from,
          body: text,
          receivedAt: ts,
          fromOwner,
          action,
          // "queued" is the flag a human should look for: it means a real instruction arrived
          // that nothing has acted on yet.
          status: action === 'queued' ? 'queued' : 'done',
        }),
      }).catch(() => {});

      if (reply) {
        const sent = await replyToOwner(brand, reply);
        handled.push({ body: text.slice(0, 40), action, replied: sent.ok });
      } else {
        handled.push({ body: text.slice(0, 40), action, replied: false });
      }
    }

    if (newest > last) {
      await fetch(dbUrl('config/inboxLastPoll'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newest),
      }).catch(() => {});
    }

    res.status(200).json({ ok: true, scanned: rows.length, new: fresh.length, handled });
  } catch (err) {
    res.status(500).json({ error: 'poll failed' });
  }
}
