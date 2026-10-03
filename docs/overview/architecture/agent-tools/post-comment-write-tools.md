# Post and Comment Write Tools

Three MCP-only tools perform the caller's own post and comment writes. All require Plus or Pro
and both `posts:read` and `posts:write`. The scope catalog supplies resource/action metadata to
API-key and OAuth consent, including the read prerequisite. The existing generic consent copy
covers the new write scope; no separate frontend permission contract is needed.

| Web action                                                        | Tool                                                 | REST twin                                  | Shared service                                      |
| ----------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------ | --------------------------------------------------- |
| Create discussion, review, data point, link, article or blog post | `create_post`                                        | `POST /api/v1/posts`                       | `preparePostWithCommunityReviews`                   |
| Create a community post                                           | `create_post` with `community_id`                    | `POST /api/v1/communities/:idOrSlug/posts` | Same prepared post service and community guards     |
| Reply to a post or comment                                        | `create_post` with `post_type: comment`, `parent_id` | `POST /api/v1/posts`                       | Same prepared post service and comment-scope guards |
| Edit title, content, structured data, categories or media         | `update_post`                                        | `PATCH /api/v1/posts/:idOrSlug`            | `assertPostUpdatePreflight`, `updatePost`           |
| Archive or unarchive                                              | `update_post` with `archive: true/false`             | Same PATCH route                           | Same update service                                 |
| Delete own post or comment                                        | `delete_post`                                        | `DELETE /api/v1/posts/:idOrSlug`           | `deletePost`                                        |

Story creation uses its dedicated workflow and is excluded. Replies to readable public stories
remain ordinary comments. Topic recommendations use the [dedicated recommendation tools](relation-referral-recommendation-write-tools.md).
Articles and blog posts keep the existing administrator restriction; official and automated accounts cannot
create reviews or data points. These tools never grant administrator mutation authority over
another member's content.

Creation requires a UUID `idempotency_key`. The
[delegated contribution admission policy](../../../requirements/platform/agent-access.md#delegated-contribution-admission)
uses the credential owner's real membership plan, budgets and exemptions. Both creation tools
reuse `admitDelegatedContribution` next to `admitRouteContribution`; post creation keeps the same
route/body identity and durable response as REST. Exact retries reuse the existing contribution;
changed bodies fail with `IDEMPOTENCY_KEY_REUSED`, active claims report
`CONTRIBUTION_ADMISSION_IN_PROGRESS` with a retry delay, and exhausted budgets report
`CONTRIBUTION_QUOTA_EXCEEDED`. Delegated credentials do not accept first-party challenge fields.

Suspension and identity checks run before mutation. Existing services enforce each post type's
input rules, trust restrictions, review requirements, edit window, slug and media authorization,
community membership and enabled types, and locked-thread rules. MCP additionally requires
exact ownership for edits and deletion. Reply and mutation targets must be publicly readable
or the caller's own private content; comment ancestry and visibility are checked on the primary
store, fail closed when the root or target is absent, and preserve deleted intermediate placeholders.

Created rows retain MCP and OAuth-client provenance. Create and update return the shared
sanitized, fenced MCP Post shape, including persisted text that was not part of the current edit.
Delete returns `{ success: true }`. Metadata describes creation as idempotent through its required
key, updates as non-idempotent, and deletion as destructive and idempotent; the registry and catalog
checks validate these hints and output schemas.
