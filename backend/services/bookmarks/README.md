# @services/bookmarks

User bookmark management with upsert/get operations, count aggregations, and bloom filter integration for fast existence checks.

## Key exports

- `upsertBookmark(currentUserId, postId, bookmarked)` — creates or removes a bookmark
- `getBookmark(currentUserId, postId)` — retrieves a single bookmark record
- `getBookmarkCounts(postId)` — aggregate bookmark count for a post
- `isBookmarkBloomFilterEnabled()` — checks whether the bloom filter feature is active
- `checkBookmarkBloomCandidates(userId, relationTableName, objectIds)` — bulk bloom-filter existence check before DB lookup
- `checkBookmarkBloomCandidatesByRelations(userId, relationTableNames, objectIds)` — relation-aware multi-check that batches relation readiness and candidate checks through Lua
- `addBookmarkBloomEntries(userId, relationTableName, objectIds)` — adds bookmark entries to the bloom filter
- `deleteUserBookmarkBloomFilter(userId)` — removes all bloom filter entries for a user

## Query invariant

Single-relation and multi-relation reads share one root-annotated SQL statement, including the
bloom-filter narrowed path. Only validated relation metadata supplies table/predicate names; user
and object IDs remain parameters. The annotation belongs before the assembled `UNION ALL`, so
development runtime enforcement and query telemetry identify the complete statement.

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- Entity cache: [../entity-cache/README.md](../entity-cache/README.md)
