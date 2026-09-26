# Community Anatomy

> A user-created space for topic-focused discussion, with curated lists, member roles, and
> moderation controls.

## See Also

- [Entity × Action Matrix — community](../reference-community.md#community)
- [Entity × Lifecycle Flow Matrix — communities](../reference-communities.md#communities)
- [Communities requirements](../community/COMMUNITIES.md)
- [Community Lists requirements](../community/community-lists.md)

## Data Model

| Field                      | Notes                                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `id`                       | UUID                                                                                                                          |
| `slug`                     | URL-safe identifier; auto-generated when omitted                                                                              |
| `name`                     | Must have ≥3 words, trimmed, 1–100 characters                                                                                 |
| `description`              | Plain-text community description                                                                                              |
| `member_roster_visibility` | Who can see regular members: `public` \| `users` \| `members` \| `moderators`                                                 |
| `archived_at`              | Non-null when archived                                                                                                        |
| `created_via`              | Immutable channel of the writing request; `system` for seeded communities; see [provenance](../content/content-provenance.md) |

**Membership roles:** owner, moderator, member.

## States

| State    | Condition                 | Behavior                                                                                                               |
| -------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Active   | `archived_at IS NULL`     | Normal — new members can join, new posts can be created                                                                |
| Archived | `archived_at IS NOT NULL` | Read-only — no new members or posts; existing content still readable; public communities remain visible to non-members |

An archived community can be unarchived by the owner.

## Surfaces

| Surface     | Route pattern                            |
| ----------- | ---------------------------------------- |
| Browse      | `/communities`                           |
| Detail root | `/communities/:slug`                     |
| Posts tab   | `/communities/:slug/posts`               |
| News tab    | `/communities/:slug/news`                |
| Lists       | `/communities/:slug/lists/:type`         |
| Members     | `/communities/:slug/members`             |
| About       | Inline aside on detail routes            |
| Settings    | `/communities/:slug/settings`            |
| Moderation  | `/communities/:slug/settings/moderation` |

## List-Item / Card Anatomy

Community browse page (`/communities`) uses a responsive grid (1 column on mobile, 2 columns on
`md+`):

| Element        | Shows                            | Visible when |
| -------------- | -------------------------------- | ------------ |
| Community name | Linked to the community page     | Always       |
| Description    | Snippet of community description | Always       |
| Member count   | Total active member count        | Always       |

## Detail Anatomy

**Menubar** (display order):

| Item         | Route                                                                  | Visible to                                             |
| ------------ | ---------------------------------------------------------------------- | ------------------------------------------------------ |
| Posts        | `/communities/:slug` (root; `/communities/:slug/posts` redirects here) | Always                                                 |
| News         | `/communities/:slug/news`                                              | When community has active topic or RSS feed list items |
| Lists        | Dropdown: Topics / Sources / Posts / Domains / URLs                    | Always                                                 |
| Members      | `/communities/:slug/members`                                           | Always                                                 |
| Settings     | `/communities/:slug/settings`                                          | Owners only                                            |
| Moderation   | `/communities/:slug/settings/moderation`                               | Owners and moderators                                  |
| Pinned Posts | `/communities/:slug/settings/pinned-posts`                             | Owners and moderators                                  |

Pinned posts appear at the top of the Posts tab above the normal post list.

The root `/communities/:slug` renders the community's post feed (not a separate overview page).

**Sidebar:** community about card (inline — description, stats, owners/moderators).

## Actions

| Action           | Who can act                              |
| ---------------- | ---------------------------------------- |
| Create           | Signed-in users with a username          |
| Join             | Signed-in users (active community)       |
| Leave            | Members                                  |
| Post             | Members (community-scoped post creation) |
| Edit settings    | Owners                                   |
| Moderate         | Owners and moderators                    |
| Pin / Unpin post | Owners and moderators                    |
| Archive          | Owners                                   |
| Unarchive        | Owners                                   |

## Related

- [post](./post.md) — community-scoped posts
- [source-item](./source-item.md) — community news tab shows RSS items
- [topic](./topic.md) — topics listed in community curated lists
