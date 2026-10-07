# Community Post Reviews Service

Source entrypoint: [backend/services/communities/publications/README.md](../../../../../../backend/services/communities/publications/README.md)

Manages the review lifecycle for community-scoped posts. A post is either global
(`posts.community_id IS NULL`) or belongs to exactly one community (`posts.community_id = communities.id`).
Community posts have one `community_post_reviews` row keyed by `post_id`.

Global public posts may be cross-posted into a community by creating a new community-scoped
`discussion` whose `parent_post_id` points at the global source post. Cross-post discussions are not
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

An approved review row requests a community moderation classifier run (`requestCommunityModerationRun`
writes the `classifier_run_requests` row in the publication transaction and enqueues the shared
dispatcher after commit). Community owners and moderators can
approve, reject, or unpublish their own community's publications. Administrators and site
moderators can instead record a platform override: approve, reject, unpublish, or restore. The
latest override is a projection and every decision is retained in `community_post_review_changes`.
Community and automated moderation cannot alter a publication after a platform override.

A community's automod action is `communities.automod_action` (`record_only` by default). When it
is `unpublish`, a flag unpublishes the post as automod (never under platform override) and records
the flag on the review row. When it is `review_queue`, the community records a classifier flag on the same review row
(`automod_action`, `automod_flagged_at`, `automod_flagged_content_sha256`). The flag is open only
for the post-content version it was raised on, until a moderator dismisses it
(`automod_dismissed_at`, `automod_dismissed_by_id`) or the post leaves the approved state. The
open-flag definition and the dismissal route live in the
[community moderation reference](../../../../../requirements/moderation/reference-community-moderation-moderation-queue.md#automod-review-queue).

## Status Model

| State       | Condition                                                                    |
| ----------- | ---------------------------------------------------------------------------- |
| Pending     | `approved_at IS NULL AND rejected_at IS NULL`                                |
| Approved    | `approved_at IS NOT NULL AND unpublished_at IS NULL AND rejected_at IS NULL` |
| Rejected    | `rejected_at IS NOT NULL`                                                    |
| Unpublished | `unpublished_at IS NOT NULL`                                                 |

Platform override metadata is staff-only: `platform_override_*` holds the current platform
decision, its stable public reason code, and an optional private note. It is not included in public
post contracts.

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

| Function                                                    | File                 |
| ----------------------------------------------------------- | -------------------- |
| `createCommunityPostReview(userId, postId, id)`             | `add.mts`            |
| `approvePublication(user, communityId, postId)`             | `moderate.mts`       |
| `rejectPublication(user, communityId, postId)`              | `moderate.mts`       |
| `unpublishPost(user, communityId, postId)`                  | `moderate.mts`       |
| `overridePublication(user, communityId, postId, override)`  | `moderate.mts`       |
| `unpublishPostAsAgent(communityId, postId)`                 | `agent-moderate.mts` |
| `unpublishPostForAutomodFlag(query, input)`                 | `agent-moderate.mts` |
| `flagPostForAutomodReview(query, input)`                    | `automod-flag.mts`   |
| `dismissCommunityAutomodFlag({ communityId, postId, ... })` | `automod-flag.mts`   |
| `requestCommunityModerationRun(query, postId)`              | `moderation-run.mts` |
| `requestCommunityModerationRunForPost(postId)`              | `moderation-run.mts` |
| `searchCommunityPosts(communityId, opts?)`                  | `get.mts`            |
| `searchPendingPosts(communityId, opts?)`                    | `get.mts`            |
| `getCommunityPostReview(communityId, postId)`               | `get.mts`            |

## Related

- Community moderation pipeline: [`docs/overview/architecture/queues/ai-agents/README.md`](../../../queues/ai-agents/README.md)
- Post lifecycle: [`docs/overview/architecture/post-lifecycle.md`](../../../post-lifecycle.md)
- Community types: [`backend/services/communities/types.mts`](../../../../../../backend/services/communities/types.mts)

## Provisional export status (#1360)

These package exports are retained pending intended-use review. External production use is
unconfirmed; the exports may be made private or removed after review. Their implementations and
current owner behavior remain unchanged.

- `getPublicationReviewChanges`
