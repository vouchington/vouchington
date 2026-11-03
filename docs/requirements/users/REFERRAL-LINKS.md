# Referral Links

Referral links allow users to share affiliate/referral URLs on referral program topics and on any other topics linked to a referral program via `topics.referral_program_id`. Links are displayed in a prioritized order based on the viewer's relationship with each link owner.

## Ranking and caching

Why two reads: the part of the list that depends on the viewer is small and cheap, and the part that is the same for everyone is expensive, so only the second is cached.

- In-network links (mutual follow, follow, referred you, rated positively) come from one statement for signed-in viewers, capped at five. Rated positively looks at the latest 1,000 votes only, so a long vote history cannot slow it.
- Out-of-network links (official links plus the top ranked others, about 25) come from one statement per program with no viewer input. It is cached in Valkey for five minutes and cleared when a program's links are added, activated, deactivated or removed. Membership lapses, crawler deactivation, label edits and child soft-deletes are not cleared and wait out the TTL.
- The backend filters the cached list per viewer (own link, muted, blocked). A viewer with any in-network links sees no personal out-of-network links; official links always come from the cache.
- "Show all" is not ranked: it pages newest first with a keyset on the link id.
- Queries compare the official account's id. The id is resolved from the account's username once per process.
