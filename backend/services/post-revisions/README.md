# Post Revisions

Append-only revision log for posts. Tracks per-field before/after diffs when posts are created, updated, or deleted.

## Data Model

### `post_revisions`

| Column        | Type                  | Description                                        |
| ------------- | --------------------- | -------------------------------------------------- |
| id            | UUID (PK)             | UUIDv7, provides temporal ordering                 |
| post_id       | UUID (FK)             | References `posts(id)` with CASCADE delete         |
| revision_type | revision_types (ENUM) | `create`, `update`, or `delete`                    |
| revised_by_id | UUID (FK)             | User who made the change; nullable                 |
| changes       | JSONB                 | `{ "field": { "before": <old>, "after": <new> } }` |
| created_at    | TIMESTAMPTZ           | Virtual, derived from UUIDv7 id                    |

Partitioned by RANGE on `id` with a DEFAULT partition.

### Tracked Fields

`title`, `markdown`, `ai_summary_markdown`, `broadcast`, `privacy`, `is_anonymous`, `structured_data`, `data_point_vertical`, `declared_language`, `deleted_at`, `archived_at`, plus synthetic `slug`, `post_images`, and `review_topic_ratings` entries for side-table changes that emit post listener work.

## Integration

Revisions are written **synchronously** inside the same transaction as the post create/update/delete operation. This guarantees consistency without relying on async job queues.

- **Create**: `createPost()`, `insertStoryPostRecord()` insert a `create` revision
- **Update**: `updatePost()` inserts an `update` revision with only the changed fields
- **Delete**: `deletePost()` inserts a `delete` revision recording `deleted_at`

## API

```typescript
createPostRevision(postId, revisionType, changes, revisedById, options?)
getPostRevisions(postId, options?)
computePostChanges(before, after) // utility to diff two post states
```

## Related

- Topic Revisions: [`../topic-revisions/README.md`](../topic-revisions/README.md)
- Posts Service: [`../posts/CLAUDE.md`](../posts/CLAUDE.md)
- Post Lifecycle: [`../../../docs/overview/architecture/post-lifecycle.md`](../../../docs/overview/architecture/post-lifecycle.md)
