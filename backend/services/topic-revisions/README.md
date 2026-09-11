# Topic Revisions

Append-only revision log for topics. Tracks per-field before/after diffs when topics are created or updated.

## Data Model

### `topic_revisions`

| Column           | Type                  | Description                                                   |
| ---------------- | --------------------- | ------------------------------------------------------------- |
| id               | UUID (PK)             | UUIDv7, provides temporal ordering                            |
| topic_id         | UUID (FK)             | References `topics(id)` with CASCADE delete                   |
| revision_type    | revision_types (ENUM) | `create`, `update`, or legacy `delete`                        |
| revised_by_id    | UUID (FK)             | User who made the change; nullable                            |
| revised_by_roles | TEXT[]                | Snapshot of the reviser's roles when the revision was written |
| changes          | JSONB                 | `{ "field": { "before": <old>, "after": <new> } }`            |
| created_at       | TIMESTAMPTZ           | Virtual, derived from UUIDv7 id                               |

Not partitioned (small table).

### Tracked Fields

`name`, `slug`, `topic_type`, `markdown`, `logo_image_id`, `hero_image_id`, `homepage_url_id`, `hostname_id`, `rewards_program_id`, `referral_program_id`

## Integration

Revisions are written **synchronously** inside the same transaction as the topic create/update operation.

- **Create**: `createTopic()` inserts a `create` revision
- **Update**: `updateTopic()` inserts an `update` revision with only the changed fields
- **Delete**: topic deletion is intentionally unsupported; the enum value is retained only for historical rows.
- **Upsert**: `upsertTopic()` does not track revisions (automated workflow with no user attribution)

Topic detail pages use the latest admin-authored `create` or `update` revision whose `changes`
include `name` or `markdown` as the public topic content update attribution. The admin decision uses
the `revised_by_roles` snapshot so later role changes do not rewrite historical attribution.
Non-content changes such as images, homepage URLs, source metadata, relationships, and user-generated
posts do not update that label. A partial index on admin content revisions supports the topic detail
lookup.

## API

```typescript
createTopicRevision(topicId, revisionType, changes, revisedById, options?)
getLatestTopicContentUpdate(topicId, options?)
getTopicRevisions(topicId, options?)
computeTopicChanges(before, after) // utility to diff two topic states
```

## Related

- Post Revisions: [`../post-revisions/README.md`](../post-revisions/README.md)
- Topics Service: [`../topics/README.md`](../topics/README.md)
