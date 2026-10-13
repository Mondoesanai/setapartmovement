# Set Apart Movement — text messages

Plain ASCII only. Curly quotes, em-dashes and emoji push a text out of GSM-7, which cuts the
per-credit limit from 160 characters to 70 — one "nice" apostrophe doubles what a send costs.
Paste exactly as written; if you retype one, retype it with straight quotes.

**Budget: 2 credits per message.** One credit is 160 characters. Past that it splits, and each
part is 153 (the join headers eat 7), so **2 credits = 306 characters**. It arrives on the phone
as one message either way.

Opt-out language goes in the first send of a cycle, not every send.

---

## What we learned from Monday Oct 12

The announcement went to 111 people at 9:00 AM. It got **1 reply and 1 opt-out.** Flat.

It was written in a neutral, announcement-y voice — "Hey! Set Apart Movement is back this Saturday
night and we would love to have you there." Nothing wrong with it, and nothing to it either. It
reads like a notice board, not like a person who wants you there.

**The fix is voice, not information.** These go to teenagers who know Mondoe. A text that doesn't
sound like him sounds like spam. Write it the way you'd say it out loud: "Yo", contractions,
"pull up", "hit different". One real sentence of why you want them there beats three of logistics.

---

## Meetup 008 — Saturday, October 17

### Sent — Monday Oct 12, 9:00 AM (111 people, 1 reply, 1 opt-out)

> Hey! Set Apart Movement is back this Saturday night and we would love to have you there. All the
> info is here: setapartmovement.com Reply STOP to end

### Scheduled — Saturday Oct 17, 9:00 AM, to people who RSVP'd (254 chars, 2 credits)

> Yo! Today is the day. Set Apart Movement is tonight and I'm hyped you said you're in. Your spot
> is saved. If you can, grab somebody and bring them with you, that's what makes these nights hit
> different. All the info: setapartmovement.com See you tonight!

### Scheduled — Saturday Oct 17, 9:00 AM, to everyone else (239 chars, 2 credits)

> Yo! Today is the day. Set Apart Movement is tonight and there's still room for you. No RSVP
> needed, no cost, just pull up. Bring a friend if you can. It's always better when more of us are
> in the room: setapartmovement.com Hope to see you!

The split matters. "Your spot is saved" to someone who never RSVP'd reads like a form letter, and
"there's still room" to someone who already committed makes them feel forgotten.

---

## How to write these

- **Sound like a person, not an organization.** "Yo! Today is the day" lands. "We would love to
  have you there" is a press release.
- **Say why you want them there.** The line that does the work in the RSVP text is "that's what
  makes these nights hit different" — it's the only sentence that isn't logistics.
- **One ask per message.** Never "RSVP and invite someone and follow us."
- **Send them to the link instead of listing details.** A text is an invitation, not a flyer, and
  it means you update the site when something changes, never the text.
- **Kill the barriers out loud.** "No cost, no RSVP needed, just pull up" removes the three things
  a teenager silently worries about.
- **Switch it up every cycle.** Same frame twice in a row and people stop reading.

---

## Message bank for future meetups

### Announcement (first send of a cycle)

1. Yo! Set Apart Movement is back this [DAY] night. It's free, bring whoever you want, just pull
   up. Everything you need: setapartmovement.com
2. Yo! We're back [DAY] night and I'm hyped about this one. Bring somebody who's never come with
   you. All the info: setapartmovement.com
3. Set Apart Movement is back [DAY]. If you've been before you already know. If you haven't, this
   is the one to pull up to: setapartmovement.com
4. Yo! [DAY] night, we're back. No cost, no pressure, just come be in the room. Details here:
   setapartmovement.com

### Day-of, RSVP'd

1. Yo! Today is the day. Your spot is saved and I'm hyped you're coming. Grab somebody on your way:
   setapartmovement.com
2. Tonight's the night and you're already on the list. Bring your person with you. See you there:
   setapartmovement.com
3. Yo! A few hours out. You said you're in so we're counting on you. Don't leave us hanging:
   setapartmovement.com

### Day-of, did not RSVP

1. Yo! Today is the day. There's still room for you, no RSVP needed, just pull up:
   setapartmovement.com
2. Tonight's the night! You haven't said either way and that's all good, door's open:
   setapartmovement.com
3. Yo! Set Apart Movement is tonight. Would be really good to see you in the room:
   setapartmovement.com

### Welcome (first text after someone joins)

1. Yo! You're on the list for Set Apart Movement. I'll text you the second the next one is set,
   that's it. Reply STOP anytime.
2. Welcome in! You'll hear from me first when the next meetup drops. Reply STOP to end.

### After a meetup (keeps the list warm between events)

1. Yo, last night was something else. Thank you for pulling up. Next one's already in the works.
2. Still thinking about last night. If you brought somebody with you, that's on you. Appreciate you.

---

## Rules to keep credits honest

- 2 credits max per message (306 characters).
- Plain ASCII only. No emoji, no curly quotes, no em-dashes.
- Two sends per meetup is the right rhythm for this list size. Three starts costing opt-outs.
- Run `node check-sms.mjs` after editing — it fails if a message would cost more than budgeted.
- **Campaigns cannot be edited through the API** (PATCH returns 405). Changing a scheduled send
  means deleting it and creating a new one. Delete first: a gap with no send is recoverable,
  two live copies would text everybody twice.
