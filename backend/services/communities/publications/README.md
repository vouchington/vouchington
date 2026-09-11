# Community Post Reviews Service

Manages the review lifecycle for community-scoped posts. A post is either global
(`posts.community_id IS NULL`) or belongs to exactly one community (`posts.community_id = communities.id`).
Community posts have one `community_post_reviews` row keyed by `post_id`.

Global public posts may be cross-posted into a community by creating a new community-scoped
`discussion` whose `parent_id` points at the global source post. Cross-post discussions are not
comments; comment queries filter to `post_type='comment'`.

## Review Lifecycle

```
POST /api/v1/communities/:idOrSlug/posts
  └── createPost()
        ├── INSERT posts (with community_id)
        └── INSERT community_post_reviews
              ├── approved_at = NOW()    ← if community approval is not required
              └── approved_at = NULL     ← pending moderator review
```

Approved review rows enqueue community moderation agents. Pending rows are approved, rejected, or
unpublished by community moderators.

## Status Model

| State       | Condition                                                                    |
| ----------- | ---------------------------------------------------------------------------- |
| Pending     | `approved_at IS NULL AND rejected_at IS NULL`                                |
| Approved    | `approved_at IS NOT NULL AND unpublished_at IS NULL AND rejected_at IS NULL` |
| Rejected    | `rejected_at IS NOT NULL`                                                    |
| Unpublished | `unpublished_at IS NOT NULL`                                                 |

## Visibility Rules

Community posts may only use:

- public: `broadcast='everyone'`, `privacy='public'`
- signed-in-only: `broadcast='users'`, `privacy='private'`

Private communities require signed-in-only community posts; public community posts are only allowed
in public communities. Direct post reads for private-community posts must also pass community
membership checks.

Global feeds and search query only global posts. Community feeds query `posts.community_id` plus the
community review state.

Community feed search supports newest-first and hot-score sorting. The web canonical route is
`/communities/:slug/posts`; `/communities/:slug` is reserved for the overview page.

## API Surface

| Function                                        | File           |
| ----------------------------------------------- | -------------- |
| `createCommunityPostReview(userId, postId, id)` | `add.mts`      |
| `approvePublication(user, communityId, postId)` | `moderate.mts` |
| `rejectPublication(user, communityId, postId)`  | `moderate.mts` |
| `unpublishPost(user, communityId, postId)`      | `moderate.mts` |
| `unpublishPostAsAgent(communityId, postId)`     | `moderate.mts` |
| `searchCommunityPosts(communityId, opts?)`      | `get.mts`      |
| `searchPendingPosts(communityId, opts?)`        | `get.mts`      |
| `getCommunityPostReview(communityId, postId)`   | `get.mts`      |
| `getApprovedReviewsForPost(postId)`             | `get.mts`      |

## Related

- Community moderation pipeline: [`backend/queues/ai-agents/README.md`](../../../queues/ai-agents/README.md)
- Post lifecycle: [`docs/overview/architecture/post-lifecycle.md`](../../../../docs/overview/architecture/post-lifecycle.md)
- Community types: [`backend/services/communities/types.mts`](../types.mts)
