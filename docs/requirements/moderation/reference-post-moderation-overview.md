# Post Moderation reference

[Back to Post Moderation](POST-MODERATION.md)

## Overview

Voucha operates a two-tier moderation model: a global layer managed by platform administrators (clearance, hard delete, archive) and a community layer managed by community owners and moderators (pending post approval, unpublish from community, pin). These two layers are independent — a community moderator's actions affect only how a post appears within that community, while global admin actions affect the post across the entire platform. Comments are a special case: community moderators may hard-delete comment-type posts within their community, giving them a stronger tool than unpublish for community-scoped content.

## Roles

| Role                | Source                                        | Scope                                                                                                                                   |
| ------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Anonymous           | Unauthenticated request                       | View only                                                                                                                               |
| Author              | `post.created_by_id === currentUser.id`       | Own posts: edit (≤1 day), delete, archive/unarchive                                                                                     |
| Global admin        | `currentUser.roles.includes('administrator')` | All actions on any post                                                                                                                 |
| Community owner     | `community_members.role = 'owner'`            | Everything a moderator can do, plus update/delete the community                                                                         |
| Community moderator | `community_members.role = 'moderator'`        | Approve/reject pending, unpublish published non-comment posts, pin (≤3), manage agent prompts, hard-delete community comment-type posts |
| Community member    | `community_members.role = 'member'`           | Post, report                                                                                                                            |

## Moderation Actions

### Hard Delete (`delete`)

Permanently removes the post from all surfaces. Sets `posts.deleted_at` and `posts.deleted_by_id`, writes a `post_revisions` row (`type = 'delete'`), and fires `enqueueOnPostDeleted`. This action cannot be undone through the UI.

Service: `backend/services/posts/delete.mts`

### Unpublish from Community

Soft-retracts a post from a specific community without deleting the post itself. Sets `community_post_reviews.unpublished_at` and `community_post_reviews.unpublished_by_id`. The `posts` row survives with `community_id` intact; the post is filtered from all community feeds and listings. This is distinct from a hard delete — the author can still access the post.

Service: `backend/services/communities/publications/moderate.mts` (lines 113–135)

### Archive / Unarchive

Toggles `posts.archived_at` and `posts.archived_by_id`. Archived posts are hidden from public listings but remain accessible by direct link. Only the author or a global admin can archive or unarchive.

Service: `backend/services/posts/archive.mts`

### Clearance (Approve / Reject / In-Review / Pending)

Admin-only global content review. Appends a row to the `post_clearance_changes` log and updates the corresponding flag on the `posts` row: `posts.approved_at`, `posts.rejected_at`, or `posts.in_review_at` (at most one non-null, enforced by check constraint).

Service: `backend/services/post-clearance/`

### Approve / Reject Pending (Community Publication Queue)

Community owners and moderators (or global admins) can approve or reject posts submitted to the community's pre-publication queue. Updates `community_post_reviews.approved_at` or `community_post_reviews.rejected_at`.

Service: `backend/services/communities/publications/moderate.mts` (lines 39–111)

### Report

Any signed-in user can submit a report against a post. Reports are trust-tier rate-limited and create a `moderation_reports` row. Reports are reviewable at `/reports` by global admins and in community moderation queues for community-scoped post/comment reports. Admins and community moderators can mark scoped reports reviewed or dismissed; enforcement still happens through the existing post, user, and hostname moderation surfaces.

See [REPORTING.md](./REPORTING.md) for the full report submission flow, rate limits, and schema.

### Pin (≤3 per community)

Community owners and moderators (or global admins) can pin up to 3 posts per community. Stored in `community_pinned_posts` with `order_index 0–2`.
Pinned posts render at the top of `/communities/:slug/posts`; the community root
`/communities/:slug` is an overview page.

Service: `backend/services/communities/publications/pinned.mts`
