# Communities Service

Handles community CRUD, membership management, community post reviews, invites, and applications.

## What This Service Does

- **Create / update / archive / delete** communities and their settings
- **Membership**: join, leave, remove members, update roles (owner, moderator, member)
- **Post reviews**: create community-scoped posts, moderate (approve/reject), unpublish
- **Post type settings**: opt communities into review and data point root posts
- **Invites**: create, redeem, and revoke invite links
- **Applications**: submit, get, and review join applications with custom questions
- **Authorization**: role-based checks for all mutating operations

## Community Creation

Any authenticated user with a username may create communities. There is no tier gate and no limit on how many communities a user may own.

**Name rules:** minimum 3 words, trimmed, 1–100 characters. Validated in `create.mts` via `countWords()` from `@modules/utils`.

**Slug rules:** optional. When omitted, auto-generated as `createSlugFromTitle(name, 65) + '-' + convertUUIDToBase36(id)` — the same pattern as post slugs, ensuring uniqueness via the UUIDv7 suffix. User-supplied slugs are validated via `validateCommunitySlug()`.

The only creation gate is a username requirement. The route returns HTTP 403 with code `IDENTITY_REQUIRED` when no username is set.

**File:** [`backend/services/communities/authorization.mts`](authorization.mts) — `assertCanCreateCommunity()`

New communities can host discussion posts and curated lists as soon as they are created. Reviews and
data points are opt-in settings, defaulting to disabled until an owner, moderator, or administrator
enables them.

## Ownership Transfer on Membership Lapse

This behavior was removed. Community ownership is now unlimited — any user can own any number of communities.

## Auto-Archiving

Archived communities are read-only: no new members, no member role changes, no member removals, no ownership transfers, and no new posts. All existing content remains readable. Archiving is non-destructive; an archived community can be unarchived if the owner claims it back.

## Data Model

- `communities` — core entity; `archived_at`/`archived_by_id` track archival state; `deleted_at` is a soft-delete
- `community_members` — role assignments (`owner`, `moderator`, `member`) with `removed_at` for soft-removal
- `community_invites` — invite links with `accepted_at`, `declined_at`, `revoked_at` lifecycle columns
- `community_applications` — join applications with `approved_at`/`rejected_at` review flow
- `community_post_reviews` — one review/moderation row for each community-scoped post
- `view_memberships` (read-only, cross-service) — plan/status lookup for slot eligibility checks

## Usage Examples

```typescript
// Create a community (free for any user with a username)
await createCommunity(userId, { name: 'My Community' })

// Archive or unarchive a community through the owner/admin-gated service
await setCommunityArchiveState(currentUser, communityId, true, membership)
```

## Integration Points

- **Community agent prompts** (`@services/community-agent-prompts`) provide the paid community prompt-slot feature.

## Key Modules

| File                                               | Purpose                                                   |
| -------------------------------------------------- | --------------------------------------------------------- |
| [`create.mts`](create.mts)                         | Community creation (free, no membership gate)             |
| [`update.mts`](update.mts)                         | Settings and metadata updates                             |
| [`post-type-settings.mts`](post-type-settings.mts) | Review/data-point post-type flags and eligibility helpers |
| [`delete.mts`](delete.mts)                         | Soft-delete (sets deleted_at)                             |
| [`get.mts`](get.mts)                               | Fetch community by slug or ID                             |
| [`columns.mts`](columns.mts)                       | Response column list for detail, batch and search reads   |
| [`authorization.mts`](authorization.mts)           | Role-based permission helpers                             |
| [`slugs.mts`](slugs.mts)                           | Slug generation and uniqueness                            |
| [`types.mts`](types.mts)                           | Shared TypeScript types                                   |
| [`members/`](members/)                             | Join, leave, remove, role updates                         |
| [`publications/`](publications/)                   | Community post reviews and moderation                     |
| [`invites/`](invites/)                             | Invite link lifecycle                                     |
| [`applications/`](applications/)                   | Join application flow with custom questions               |

## Related

- API routes: [../../api/v1/communities/README.md](../../api/v1/communities/README.md)
- Moderation queue: [../community-agent-prompts/README.md](../community-agent-prompts/README.md)
- [Communities requirements](../../../docs/requirements/community/COMMUNITIES.md)
- [Memberships](../../../docs/requirements/users/memberships.md) — tier limits and billing
