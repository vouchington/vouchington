# Post and Comment Write Tools

Three MCP-only tools perform the caller's own post and comment writes. All require Plus or Pro
and both `posts:read` and `posts:write`. The scope catalog supplies resource/action metadata to
API-key and OAuth consent, including the read prerequisite. The existing generic consent copy
covers the new write scope; no separate frontend permission contract is needed.

| Web action                                                        | Tool                                                      | REST twin                                  | Shared service                                      |
| ----------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------- |
| Create discussion, review, data point, link, article or blog post | `create_post`                                             | `POST /api/v1/posts`                       | `preparePostWithCommunityReviews`                   |
| Create a community post                                           | `create_post` with `community_id`                         | `POST /api/v1/communities/:idOrSlug/posts` | Same prepared post service and community guards     |
| Reply to a post or comment                                        | `create_post` with `post_type: comment`, `parent_post_id` | `POST /api/v1/posts`                       | Same prepared post service and comment-scope guards |
| Edit title, content, structured data or categories                | `update_post`                                             | `PATCH /api/v1/posts/:idOrSlug`            | `assertPostUpdatePreflight`, `updatePost`           |
| Archive or unarchive                                              | `update_post` with `archive: true/false`                  | Same PATCH route                           | Same update service                                 |
| Delete own post or comment                                        | `delete_post`                                             | `DELETE /api/v1/posts/:idOrSlug`           | `deletePost`                                        |

Story creation uses its dedicated workflow and is excluded. Replies to readable public stories
remain ordinary comments. Topic recommendations use the [dedicated recommendation tools](relation-referral-recommendation-write-tools.md).
Articles and blog posts keep the existing administrator restriction; official and automated accounts cannot
create reviews or data points. These tools never grant administrator mutation authority over
another member's content.

Image attachment edits use the separate REST post-images endpoint. `update_post` rejects images and immutable type, thread, community and source URL fields; creation derives `root_post_id` from its parent. Comments inherit their thread audience and reject audience inputs in both creation and edits. Creation accepts review_topic_ratings only for reviews and one of url or url_id for links.
Community creation accepts a canonical UUID `community_id`; exact retries consult admission before mutable community access checks.

Creation requires a UUID `idempotency_key`. The
[delegated contribution admission policy](../../../requirements/platform/agent-access.md#delegated-contribution-admission)
uses the credential owner's real membership plan, budgets and exemptions. Both creation tools
reuse `admitDelegatedContribution` next to `admitRouteContribution`; post creation keeps the same
route/body identity and durable response as REST. Exact retries reuse the existing contribution;
changed bodies fail with `IDEMPOTENCY_KEY_REUSED`, active claims report
`CONTRIBUTION_ADMISSION_IN_PROGRESS` with a retry delay, and exhausted budgets report
`CONTRIBUTION_QUOTA_EXCEEDED`. Delegated credentials do not accept first-party challenge fields.

Suspension and identity checks run before mutation. Existing services enforce each post type's
input rules, trust restrictions, review requirements, edit window, slug authorization,
community membership and enabled types, and locked-thread rules. MCP additionally requires
exact ownership for edits and deletion. Reply and mutation targets must be publicly readable
or the caller's own private content; comment ancestry and visibility are checked on the primary
store, fail closed when the root or target is absent, and preserve deleted intermediate placeholders. Mutation transactions retain the active-account and ancestry locks through the write; community creation rechecks enabled types under the settings row lock.

Created rows retain MCP and OAuth-client provenance. Create and update return the shared
sanitized, fenced MCP Post shape, including persisted text that was not part of the current edit.
Delete returns `{ success: true }`. Metadata describes creation as idempotent through its required
key, updates as non-idempotent, and deletion as destructive and idempotent; the registry and catalog
checks validate these hints and output schemas.

Community restriction activation and lifting acquire the same physical community row fence
(`FOR NO KEY UPDATE`) as delegated contribution decisions, before reading or changing the active
restriction set, and retain it through commit. A writer that wins the fence determines the policy
seen by the next contribution; ordinary foreign-key inserts remain compatible.
Restriction writers take actor lifecycle and moderator membership fences before the community
row, then recheck authorization. Activation rechecks archive status after waiting. Activation and
lifting enforce expiry in their writes and record timestamps using the same database statement clock.

Delegated creation and replies reject archived communities under the retained community row fence. Own-user edits and deletions preserve REST access in archived communities.
