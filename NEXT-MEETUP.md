# Putting up the next meetup

Two files. Nothing else. The site takes the old meetup down by itself.

## 1. The clock — `api/release.js`

```js
const MEETUP = {
  id: '011',
  title: 'CONNECT',
  startsAt: '2026-11-29T01:00:00Z', // Saturday 28 November 2026, 7:00 PM Central
};
```

That is the whole clock change. **Expiry is worked out from the start time, never typed in:**
one hour after the meetup starts, the homepage goes back to "the next meetup isn't announced
yet" on its own. Nobody has to remember to take anything down, and the site can never invite
somebody to an event that already happened.

Set `MEETUP = null` if nothing is on the calendar yet — the site shows the waitlist.

### Writing `startsAt`

It is in **UTC**, because a local time string would depend on whichever timezone the server
happened to boot in. For Denton:

| Season | Offset | 7:00 PM Central becomes |
|---|---|---|
| CDT — mid-March to 1 Nov | UTC−5 | `00:00:00Z` the **next day** |
| CST — 1 Nov to mid-March | UTC−6 | `01:00:00Z` the **next day** |

So Saturday 14 November at 7 PM = `2026-11-15T01:00:00Z`.

## 2. The words — `#hero-event` in `index.html`

Change the visible copy, and the three `data-` attributes on the opening tag:

```html
<div id="hero-event" hidden
     data-meetup-id="011"
     data-starts-at="2026-11-29T01:00:00Z"
     data-expires-at="2026-11-29T02:00:00Z"   <!-- start + 1 hour -->
     data-confirm-line="Saturday, November 28 at 7 PM &middot; ...">
```

Those dates are **only** the offline fallback, for when `/api/release` cannot be reached. The
server's answer always wins. They have to match `api/release.js`, and `verify-meetup.mjs` fails
if they ever drift apart.

Also update, in the same file: the `<title>`, the meta description, the Open Graph and Twitter
descriptions, the `Event` block in the JSON-LD, and the FAQ answer about the next meetup. The
verifier checks all of these against the clock.

## 3. If you want RSVPs kept separate for this meetup

```
node setup-nov14-lists.mjs     # rename the two list names inside it first
```

Creates the two SlickText buckets and seeds the "not RSVP'd" one. Spends no credits, sends
nothing, safe to re-run. Then put the two ids it prints into `RSVP_LISTS` and
`NOT_RSVPD_LISTS` in `api/join.js`.

Without this an RSVP is still captured in Firebase and still lands in Website Signups — only the
per-meetup segment is missing.

## 4. Check it before it goes out

```
node serve.mjs                 # http://localhost:3000, including /api/*
node verify-meetup.mjs         # the two files agree; no past meetup left in the metadata
node verify-gate.mjs           # drives the real page at five clocks, incl. the automatic flip
node e2e-join-010.mjs          # a real RSVP end to end, then deletes itself
```

`verify-gate.mjs` proves the flip to the second — one second before expiry, exactly at it, one
second after — and that a tab left open changes over on its own without a reload.

## Previewing before it is public

```
https://setapartmovement.com/?preview=<PREVIEW_TOKEN>
```

Add `&at=2026-11-15T02:00:01Z` to see any moment in time. The test clock is deliberately locked
behind the token, so a visitor guessing `?at=` cannot change what the site says.

## One thing to know

The page strips its own query string — the referral tracker calls
`history.replaceState(location.pathname)` partway down. Anything read from `location.search`
after that point is already gone, which is why the preview token is captured in `<head>`.
**Read URL parameters in `<head>` on this site, always.**
