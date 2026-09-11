# Trending Communities Service

Returns communities ranked by aggregate activity metrics (member count + post count + virtual subscription count).

## Data model

Reads public, non-deleted `communities` rows. Counts are set-based `GROUP BY` aggregates equivalent to `view_community_metrics` (`community_members`, approved community-reviewed eligible posts, and proxy follow/mute relations). The query does not join `view_community_metrics`; that view's correlated per-community subqueries scan the whole community set before `LIMIT` and timed out backend CI on a dirty parallel database.

Candidates are the top `TRENDING_CANDIDATE_LIMIT` (1000) communities by post activity in the last
`TRENDING_WINDOW_DAYS` (30) days; member/follow/mute counts are aggregated only for those
candidates, so cost is a function of the cap rather than total community count — required because
backend CI runs every test against one shared, continuously-growing database rather than an
isolated one per test. Two consequences follow:

- **Ranking**: a community with no posts in the window never becomes a candidate, however many
  members, follows, or mutes it has — a high-membership, low-recent-activity community can drop
  out of trending entirely, not just rank lower.
- **Pagination**: the keyset-paginated feed is finite at `TRENDING_CANDIDATE_LIMIT` — pages past
  the cap terminate instead of continuing.

## Functions

- `getTrendingCommunities(options)` → `{ communities, page_info }` — cursor-paginated list ordered by `trending_score DESC`
