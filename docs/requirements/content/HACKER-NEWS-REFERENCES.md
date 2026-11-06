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
lookup. Reads tolerate a short canonical chain; canonical rewrites are serialized and flatten
back-references so concurrent updates do not leave longer chains or cycles.

Reference facts belong to the content response rather than a viewer preference. REST and MCP
therefore share count summaries and bounded detail links. Responses carrying these facts must not
remain in a shared public cache, so hiding references can take effect on the next read.

Personalized feeds apply reference eligibility before deduplication and pagination. Each loaded page
carries its reference facts through the card providers, including continued story members and user
collections, so later pages retain the same presentation as the first page.

## Rules

- Labels are neutral facts: "Seen on Hacker News" for a story and "Mentioned on Hacker News" for a
  comment. They carry no endorsement and no call to action.
- References are shown to everyone, including logged-out viewers. They are not a personal setting.
- A reference never changes ranking, trust, moderation or any other score. It is display and
  filtering only.
- Each reference is a link out to the Hacker News item. Voucha does not copy comment text, post on
  Hacker News, or run an agent there.
- Lists can be filtered to items that have references. For posts, the filter uses the same link
  and fixed top ten positively voted related URLs in card order; references on other related
  URLs do not make the post match. The shared card membership bound stays fixed because changing
  it independently would make the stored flag disagree with the card.

## Operational controls

Operators can independently hide references and pause external lookups. Hiding references also
ignores the list filter; it leaves stored references, lookups, and retention intact. The post list's
maximum time range is separately configurable to limit filter cost.

Pausing lookups leaves stored references visible and retention active. Jobs that reach a worker
while paused finish without fetching. Re-enabling does not backfill URLs whose initial lookup was
missed: later detail views or qualifying URL changes admit those normally. For URLs already looked
up and still within the automatic refresh window, an independent bounded scan re-admits due work
from persisted lookup time. This recovers refreshes dropped while paused or after terminal provider
failure; recovery waits for that scan to reach the URL and for queue capacity. The scan carries a
fixed upper bound and saves each page position, so a large corpus does not make one job unbounded.
Delayed refresh jobs remain an optimization, not the only recovery path. A request already in
flight may finish; incomplete results are discarded when pulling has been disabled.

Backend configuration propagates through Valkey notifications with a periodic refresh fallback.
Open web pages poll the public configuration and retry data refreshes until the server acknowledges
the same settings, preserving application state while counts converge. Background timer throttling,
connectivity failures, and service outages can delay convergence.
