# Post Mentions System

This system processes entity mentions in post content and maintains exact entity relations.

## Overview

When a post is created or updated, this system:

1. Parses the post's title and markdown content for entity mentions
2. Resolves mentioned entities (@username, #topic, !post-slug)
3. Creates/updates entity relations in the `mentioned` predicate
4. Removes relations for mentions that were deleted

## Supported Mention Types

- **`@username`** - Mentions users
  - Creates: `user → mentioned → post` relation
  - Example: "Thanks @john for the help"

- **`#topic`** - Mentions topics (by slug or alias)
  - Creates: `topic → mentioned → post` relation
  - Example: "Discussion about #chase-sapphire-reserve"

- **`!post-slug`** - Mentions other posts
  - Creates: `post → mentioned → post` relation
  - Example: "See my review at !my-detailed-review"

## Exact Mention Tracking

The mentions are **exact** - if a user removes a mention from their post, the entity relation is soft-deleted. This ensures the mention relations always reflect the current state of the post content.

### Example Flow

1. User creates post: "Check out @alice and #bitcoin"
   - Creates relations: `alice → mentioned → post`, `bitcoin-topic → mentioned → post`

2. User updates post: "Check out #bitcoin only"
   - Keeps relation: `bitcoin-topic → mentioned → post`
   - Soft-deletes relation: `alice → mentioned → post`

3. User updates post: "No mentions anymore"
   - Soft-deletes relation: `bitcoin-topic → mentioned → post`

## Job Queue

### Queue Name

`post-mentions`

### Job Types

- **`processPostMentions`** - Process all mentions in a post
  - Data: `{ postId: string }`
  - Triggered: On post creation and update

### Enqueue Functions

```typescript
import { enqueuePostMentions, enqueueBulkPostMentions } from '@queues/post-mentions/enqueues'

// Process mentions for a single post
enqueuePostMentions(postId)

// Process mentions for multiple posts
enqueueBulkPostMentions([postId1, postId2, postId3])
```

## Database Schema

Entity relations are automatically created in tables following this pattern:

- `relation__user__mentioned__post` - Users mentioned in posts
- `relation__topic__mentioned__post` - Topics mentioned in posts
- `relation__post__mentioned__post` - Posts mentioned in posts

Each relation includes:

- `subject_id` - The mentioned entity (user, topic, or post)
- `object_id` - The post containing the mention
- `created_by_id` - System user
- `created_at` - Timestamp
- `deleted_at` - Soft delete timestamp (NULL if active)
- `deleted_by_id` - System user (if soft-deleted)

## Integration Points

### Post Creation/Update

The system is automatically triggered by the entity-listeners system:

- [`backend/workers/entity-listeners/processors/posts.mts`](../../workers/entity-listeners/processors/posts.mts)
- Calls `enqueuePostMentions()` on `processPostCreated` and `processPostUpdated`

### Mention Parsing

Uses the entity-links service:

- [`backend/services/entity-links/`](../../services/entity-links/)
- Provides `parseEntityMentions()` and `resolveEntityMentions()`

## Querying Mentions

To find all entities mentioned in a post:

```typescript
import { read } from '@data-stores/psql'

const { rows } = await read(
  `
  SELECT subject_id, 'user' AS entity_type FROM relation__user__mentioned__post WHERE object_id = $1 AND deleted_at IS NULL
  UNION ALL
  SELECT subject_id, 'topic' AS entity_type FROM relation__topic__mentioned__post WHERE object_id = $1 AND deleted_at IS NULL
  UNION ALL
  SELECT subject_id, 'post' AS entity_type FROM relation__post__mentioned__post WHERE object_id = $1 AND deleted_at IS NULL
`,
  [postId],
)
```

To find all posts that mention a specific entity:

```typescript
// Find posts mentioning a user
const { rows } = await read(
  `
  SELECT object_id AS post_id
  FROM relation__user__mentioned__post
  WHERE subject_id = $1 AND deleted_at IS NULL
`,
  [userId],
)

// Find posts mentioning a topic
const { rows } = await read(
  `
  SELECT object_id AS post_id
  FROM relation__topic__mentioned__post
  WHERE subject_id = $1 AND deleted_at IS NULL
`,
  [topicId],
)
```

## Performance Considerations

- **Concurrency**: 10 concurrent workers by default
- **Batching**: Use `enqueueBulkPostMentions()` for processing multiple posts
- **Caching**: Uses cached entity lookups (`getUserPublicByAnyCached`, `getTopicByAnyCached`, `getPostByAnyCached`)
- **Indexes**: Automatic indexes on `(subject_id, object_id)` and `(object_id, subject_id)`

## Error Handling

- If a post is not found, the job skips processing for that post
- If an entity is not found (e.g., @nonexistent), it's treated as unresolved and no relation is created
- Failed jobs are retried 3 times with exponential backoff
- Jobs are removed after 100 completions or 100 failures

## Future Enhancements

Potential features:

- Notifications when users/topics/posts are mentioned
- Mention analytics and trending mentions
- Mention suggestions in the post editor
- URL mention support (extract and track URLs from markdown links)

## Related

- [Post Mentions Service](../../services/post-mentions/README.md)
- [Entity Links Service](../../services/entity-links/README.md)
