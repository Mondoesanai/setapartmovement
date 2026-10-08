# Set Apart Movement — text messages

Every message below is plain ASCII on purpose. Curly quotes, em-dashes and emoji push a text out
of GSM-7 encoding, which cuts the per-credit limit from 160 characters to 70 — so one "nice"
apostrophe can quietly double what a send costs. Paste these exactly as written. If you retype a
message, retype it with straight quotes.

Opt-out language goes in the first send of a campaign, not every send.

**The link does the work.** These don't recite the time, address and price — the site already says
all of that, and cramming it in makes a text read like a flyer. One warm line, one link.

---

## Meetup 008 — Saturday, October 17

Two sends, both scheduled for 9:00 AM.

### Send 1 — Monday Oct 12, 9:00 AM — to EVERYONE

> Hey! Set Apart Movement is back this Saturday night and we would love to have you there. All the
> info is here: setapartmovement.com Reply STOP to end

### Send 2 — Saturday Oct 17, 9:00 AM — SPLIT INTO TWO

**2A — people who RSVP'd**

> Today is the day! You already saved your spot so we are counting on you tonight. Everything you
> need is here: setapartmovement.com Cannot wait to see you!

**2B — everyone who did NOT RSVP**

> Today is the day! Set Apart Movement is tonight and there is still room for you. All the info is
> here: setapartmovement.com Hope to see you there!

The split matters. "You already saved your spot" to someone who never RSVP'd reads like a form
letter, and "there is still room" to someone who already committed makes them feel forgotten.

---

## Why these are written this way

Borrowed from how churches text about events, which is the most tested version of this problem:

- **Lead with the name of the thing.** An unknown number telling you to show up somewhere gets
  ignored. "Set Apart Movement" in the first four words is the whole introduction.
- **One ask per message.** Never "RSVP and invite someone and follow us."
- **Send people to one link instead of listing details.** A text is an invitation, not a flyer.
  It also means you only update the site when something changes, never the text.
- **No hype adjectives.** "Something crazy is coming" lowers trust. "Today is the day" is enough.
- **Write how you talk.** Short sentences, contractions, a real exclamation point.

---

## Message bank for future meetups

So it never reads copy-pasted. Rotate these; don't run the same frame twice in a row.

### Announcement (first send of a cycle)

1. Hey! Set Apart Movement is back this Saturday night and we would love to have you there. All the
   info is here: setapartmovement.com
2. Set Apart Movement is back [DAY] night. Same room, same people, bring somebody who has never
   come. Everything you need: setapartmovement.com
3. Hey! We are back [DAY] night. If you have been once you know how it goes. If you have not, this
   is the one to come to: setapartmovement.com
4. Set Apart Movement is back [DAY]. No cost, no pressure, just come. All the details are here:
   setapartmovement.com

### Day-of, RSVP'd

1. Today is the day! You already saved your spot so we are counting on you tonight. Details:
   setapartmovement.com
2. Tonight is the night and you are on the list. Everything you need is here: setapartmovement.com
   See you soon!
3. Today is the day! Your spot is saved. Grab somebody on your way: setapartmovement.com

### Day-of, did not RSVP

1. Today is the day! Set Apart Movement is tonight and there is still room for you. All the info:
   setapartmovement.com
2. Tonight is the night! No RSVP needed, just come. Everything you need to know:
   setapartmovement.com
3. Today is the day! Would be really good to see you tonight. Details here: setapartmovement.com

### Welcome (first text after someone joins)

1. You are on the list for Set Apart Movement! We will text you the moment the next one is set.
   Reply STOP anytime.
2. Welcome to Set Apart Movement! You will hear from us first when the next meetup drops. Reply
   STOP to end.

### After a meetup (keeps the list warm between events)

1. Last night was something else. Thank you for coming. The next one is already in the works.
2. Still thinking about last night! If you brought somebody with you, that is on you. We
   appreciate you.

---

## Rules to keep credits honest

- Stay under 160 characters per message. Over that, one text bills as two.
- Plain ASCII only. No emoji, no curly quotes, no em-dashes.
- Two sends per meetup is the right rhythm for this list size. Three starts costing opt-outs.
- Run `node check-sms.mjs` after editing. It fails the build if a message would cost double.
