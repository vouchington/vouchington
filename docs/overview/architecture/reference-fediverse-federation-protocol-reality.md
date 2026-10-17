# Fediverse Federation reference

[Back to Fediverse Federation](fediverse-federation.md)

## Protocol reality

"The fediverse" is not one protocol. Mastodon, Lemmy, and PeerTube speak **ActivityPub**:
server-to-server delivery via actor documents, inboxes/outboxes, and HTTP signatures. Bluesky speaks
**AT Protocol**, a different mechanism entirely — a single ActivityPub actor cannot follow or like on
Bluesky. Outbound work therefore splits into two mechanisms:

- **ActivityPub** (Mastodon/Lemmy/PeerTube) — server-to-server delivery via a resurrected Voucha AP
  actor (Phase C). Federates Voucha **users** as AP actors first; source/topic actors are secondary.
- **AT Protocol** (Bluesky) — per-user OAuth account-linking; Voucha acts as a client and reconciles
  user follows via `app.bsky.graph.follow` (Phase D). A Bluesky like requires the target record's AT
  URI and CID. Voucha never publishes its posts to Bluesky, so it has no valid strong reference for
  generic like propagation.

## How the existing model maps (reuse targets)

Everything below already exists and is reused rather than reinvented.

| Fediverse concept                                               | Existing primitive                                                                                                                                                                                                                                                                                                                             | Key files                                                                                                                                                         |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instance = a votable "source-like" entity                       | new `topic_type='fediverse_instance'` + 1:1 extension table, mirroring how a **source** = `topic_type='rss_feed'` + `rss_feeds`                                                                                                                                                                                                                | `backend/data-stores/psql/migrations/0060-…-topics-taxonomy.sql`, `0080-…-rss-feeds-items.sql`; `backend/services/topics/*`                                       |
| Instance trust vote (community)                                 | **hostname election** (`hostname_votes` on `url_hostnames`) + derived 4-tier trust badge                                                                                                                                                                                                                                                       | `backend/services/elections-votes/hostname/*`; `PUT /api/v1/hostnames/:id/vote`                                                                                   |
| Topic-level vote (the "topic" of the instance)                  | **topic election** (`topic_votes`)                                                                                                                                                                                                                                                                                                             | `PUT /api/v1/topics/:id/vote`                                                                                                                                     |
| Owner "decide whether to integrate"                             | admin **allowlist** as append-only history + trigger-synced denormalized status, mirroring `rss_feed_setting_changes`→`is_enabled` and `url_hostname_blocks`→`blocked`                                                                                                                                                                         | migration `0080`, `0470-…-url-hostname-blocks.sql`; `backend/services/hostname-blocking`                                                                          |
| Vote schema (any)                                               | config-driven generators — **never** hand-write vote tables                                                                                                                                                                                                                                                                                    | `backend/data-stores/psql/config-driven/utils/election-schema-config.mts` (`VOTE_SCHEMA_CONFIGS`), `election-vote-handler.mts` (`createVoteHandler`)              |
| Follow (inbound AP `Follow` / outbound)                         | **bookmarks** system: `relation__user__follow__{user,topic,post,rss_feed}`                                                                                                                                                                                                                                                                     | `backend/api/v1/bookmarks/bookmarks.mts`, `backend/services/bookmarks/upsert.mts`, `backend/services/entity-relations/{upsert,delete,notification-reconcile}.mts` |
| Like (outbound)                                                 | A positive post sentiment choice (`like` or `vouch`) triggers the outbound emission; Neutral, negative choices, and Clear do not.                                                                                                                                                                                                              | `backend/api/election-vote-handler.mts`, `backend/services/elections-votes/shared/vote-upsert.mts`                                                                |
| Like (inbound AP `Like` / `Undo`)                               | **not** `post_votes` — an isolated `post_activitypub_like_tallies`/`activitypub_post_likes` ledger keyed by `remote_actor_id`. `post_votes.user_id` has no voter-side flexibility for a non-`users` actor (no polymorphic relationships — see `data-stores/psql/AGENTS.md`), and remote actors must never move local `votes_score_net` ranking | `backend/data-stores/psql/migrations/0563-…-ap-post-likes.sql`, `backend/services/ap-inbox-activities/dispatch-activity.mts`                                      |
| Follower fan-out / side-effect hook to emit outbound activities | relation upsert side-effect stage + follower distributions                                                                                                                                                                                                                                                                                     | `backend/services/entity-relations/notification-reconcile.mts`, `backend/services/follower-distributions/*`, `backend/queues/activitypub`                         |
| Instance software/protocol classification                       | **inbound-read** of remote NodeInfo (allowed — distinct from _serving_ it)                                                                                                                                                                                                                                                                     | new helper (Phase B), built alongside the directory that consumes it                                                                                              |

## Persistence boundary

Federation never persists fediverse **content** — remote posts, videos, profiles, and statuses stay
live-queried on every search or read and are never mirrored into local entity tables. Only the state
federation itself needs is ever stored: the instance directory and its votes (classification
metadata, not content), follows, AP actor keys (encrypted via `@modules/token-secrets`), inbox-dedup
references, and Bluesky linked-account tokens keyed by DID rather than handle, since handles are
mutable. Inbound likes live in an isolated ledger, deliberately never `post_votes`, so a remote
actor can never move local ranking.

Content ingestion — turning remote posts or videos into local Voucha entities — stays out of scope
("search now, ingest trusted later").
