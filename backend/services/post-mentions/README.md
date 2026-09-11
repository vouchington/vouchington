# @services/post-mentions

Processes `@username`, `#topic`, and `!post` mentions in post content, creating or updating entity relation records.

## Key exports

- `processPostMentions(postId)` — scans a post's content for mention patterns, then creates, updates, or deletes the corresponding `entity_relations` rows to reflect the current mention set

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- Post mentions system: [../../queues/post-mentions/README.md](../../queues/post-mentions/README.md)
- Entity relations service: [../entity-relations/README.md](../entity-relations/README.md)
- Posts service: [../posts/README.md](../posts/README.md)
