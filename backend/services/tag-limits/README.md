# Tag Limits

Standing per-(subject, relation) cap on tags a user manually _adds_ to a post, topic, RSS feed, or
RSS feed item (#8246). Voting on an existing tag is unaffected — this service only counts rows the
current user originated.

## Overview

Each tier (`just_joined`, `free`, `plus`, `pro`) has a configurable maximum number of tags it may
add per relation (e.g. `relation__post__category__topic`). Admins are unlimited, resolved in code
rather than as a config field so "unlimited" can never drift from a misconfigured Valkey value.

The limit is enforced against a live count, not a rolling quota — there is no time window and no
`RateLimiter`. Exceeding the limit throws a `403` with the `TAG_LIMIT_REACHED` error code
(`@modules/on-error/error-codes`).

## Key Files

- `config.mts` — `manual-tag-limits` DynamicConfig namespace (Valkey-backed, admin-only) and
  `getManualTagLimit(tier)`
- `count.mts` — `countUserOriginatedTagRelations(relation, subjectId, userId)`, a live
  `COUNT(*)` scoped to rows the user created (`created_by_id`) that are not soft-deleted
- `assert.mts` — `assertWithinTagAddLimit(currentUser, membershipPlan, relation, subjectId, incomingObjectCount)`,
  the single enforcement entry point

## Architecture Notes

- The count is scoped by `relation.table_name`, so each entity-relation table has its own
  independent budget (a user's post-topic tags and post-related-post tags don't share a cap).
- `relation` is always a full `EntityRelationMetadata` object, never a raw table-name string, so
  `table_name` can only be a value drawn from the closed, code-defined
  `entityRelationMetadatum` registry before being interpolated into SQL.
- Voting writes to the relation's separate `__votes` table, never a new row in `relation.table_name`,
  so votes never count against the limit.
- `subjectId` may be `null` when the subject doesn't exist yet (e.g. a post being created in the
  same request that will own the tags); the count is skipped and treated as `0` in that case.
- The autotagger, article sync, and moderator/system tagging writes are exempt by design — this
  cap targets manual contributions via the tag-management UI, not authoritative or system writes.
  See `assertWithinTagAddLimit`'s call sites for the full exemption list.

## Related

- Tag requirements: [../../../docs/requirements/content/TAGS.md](../../../docs/requirements/content/TAGS.md)
- Entity relations: [../entity-relations/README.md](../entity-relations/README.md)
- Contribution gating (unrelated daily quota for user-subject vouch tags): [../contribution-gating/README.md](../contribution-gating/README.md)
- Autotagger paid limits (the separate, LLM-driven cap): [../autotagger/README.md](../autotagger/README.md)
- Parent: [../CLAUDE.md](../CLAUDE.md)
