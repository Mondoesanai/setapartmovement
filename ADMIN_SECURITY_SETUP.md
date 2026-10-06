# Admin data security — setup (2 steps, ~5 minutes)

## Why this exists
The waitlist (names + phone numbers) and RSVP data were readable by anyone on the internet with
no login — the "admin" check on the site was only ever a JavaScript flag in the browser, which
controlled what the *page* showed, but never what the *database* allowed. The database itself had
no lock on the door. This is now fixed on the code side (`/api/admin-data.js` requires a real
password and uses a privileged key the browser never sees), but the database itself still needs
its rules tightened — that part has to happen in your Firebase account, I can't do it for you.

## Step 1 — Lock down the Firebase rules
1. Go to https://console.firebase.google.com → your Set Apart Movement project → **Realtime Database** → **Rules** tab.
2. Replace whatever's there with this, then click **Publish**:

```json
{
  "rules": {
    "waitlist": {
      ".read": false,
      ".write": true
    },
    "rsvps": {
      ".read": false,
      ".write": true
    },
    "smsOptIns": {
      ".read": false,
      ".write": true
    },
    "bracelets": {
      ".read": true,
      ".write": true
    },
    "meetups": {
      ".read": true,
      ".write": true
    },
    "config": {
      ".read": true,
      ".write": true
    },
    ".read": false,
    ".write": false
  }
}
```

This keeps `bracelets` (names/cities for the public rankings leaderboard) and `meetups` (event info)
publicly readable — those are meant to be public. `waitlist`, `rsvps` and `smsOptIns` become
**write-only** from the browser: the signup and opt-in forms still work (they write a new entry),
but nothing can read those lists back except the server-side function, below.

## Step 2 — Get the two values the server-side function needs
1. In the same Firebase console: **Project Settings** (gear icon) → **Service Accounts** tab → scroll to **Database secrets** → click **Show** next to the secret → copy it.
2. Go to https://vercel.com → the `set-apart-movement` project → **Settings** → **Environment Variables**, and add:
   - `FIREBASE_DB_SECRET` → paste the value from step 1
   - `ADMIN_PASSWORD` → pick any password you'll remember (this is what you type when you tap the logo 5x and open the waitlist/RSVP tabs — not your Firebase password, just a new one for this)
3. Redeploy (Vercel → Deployments → ⋯ on the latest one → Redeploy), or just push any small commit — the site picks up new env vars on the next deploy.

## What changes for you day to day
- Tapping the logo 5x still opens the admin panel the same way.
- The first time you open the **Waitlist** or **RSVPs** tab each browser session, it'll ask for the
  password you set in step 2. Enter it once — it's remembered for the rest of that browsing session.
- Nothing else about how you use the site changes.
