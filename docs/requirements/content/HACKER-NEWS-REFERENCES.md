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
