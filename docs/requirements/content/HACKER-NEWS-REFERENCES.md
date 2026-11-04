# Hacker News references

Posts and RSS feed items show a neutral count of the Hacker News stories and comments that link
their URL.

## Why

Readers who find a link on Voucha often want to know whether it was discussed elsewhere. A
reference is a fact about the web, so it is stored once per URL and reused by every post and feed
item that points at it, instead of being fetched per user.

Voucha later learns that two URLs are the same page (a redirect, a canonical link). References are
kept on the canonical URL, so a post or feed item that still points at an alias shows and filters by
the same references as the page it duplicates, and neither the post nor the alias needs its own
lookup. The cost is one extra lookup of the URL row when reading, bounded to two hops; a longer
chain, which only a race between two canonical updates can leave, reads as unreferenced until the
next canonical update flattens it.

## Rules

- Labels are neutral facts: "Seen on Hacker News" for a story and "Mentioned on Hacker News" for a
  comment. They carry no endorsement and no call to action.
- References are shown to everyone, including logged-out viewers. They are not a personal setting.
- A reference never changes ranking, trust, moderation or any other score. It is display and
  filtering only.
- Each reference is a link out to the Hacker News item. Voucha does not copy comment text, post on
  Hacker News, or run an agent there.
- Lists can be filtered to items that have references.

## Operational controls

Operators can independently hide references and pause external lookups. Hiding references also
ignores the list filter; it leaves stored references, lookups, and retention intact. The post list's
maximum time range is separately configurable to limit filter cost.

Pausing lookups leaves stored references visible and retention active. Jobs that reach a worker
while paused finish without fetching and are not replayed automatically. Re-enabling does not run
a catch-up sweep: later detail views admit missing or sufficiently old references, and subsequent qualifying URL
or canonical changes can admit work again. A previously fresh URL whose refresh was dropped waits
until it is old enough or another qualifying event occurs; an unattended URL can remain stale. A request already in
flight may finish; incomplete results are discarded when pulling has been disabled.

Backend configuration propagates through Valkey notifications with a periodic refresh fallback.
Open web pages poll the public configuration and refresh their data after changes; background timer
throttling, connectivity failures, and service outages can delay convergence.
