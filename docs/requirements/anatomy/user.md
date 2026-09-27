# User Anatomy

> A registered account with a public profile, social graph, and semantic trust signals.
> community-driven user tags.

## See Also

- [Entity × Action Matrix — user](../reference-user.md#user)
- [Entity × Lifecycle Flow Matrix — users](../reference-users.md#users)
- [User Relation Matrix](../users/USER-RELATION-MATRIX.md)
- [Users requirements](../users/USERS.md)

## Data Model

| Field                        | Notes                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| `id`                         | UUID                                                                                   |
| `username`                   | URL-preferred identifier; required for certain actions                                 |
| `display_name`               | Display name shown in UI (derived from OAuth provider, not a stored column)            |
| `markdown`                   | Bio rendered as HTML in the profile header and Overview                                |
| `profile_links`              | Social links rendered as icon anchors in header (stored in `user_profile_links` table) |
| `engagement_emails_enabled`  | Enables one-time, outcome-triggered setup recommendations                              |
| `news_digest_frequency`      | First-party news digest cadence: `none`, `daily`, or `weekly`                          |
| `community_digest_frequency` | Community digest cadence: `none`, `daily`, or `weekly`                                 |

## States

| State     | Condition      | Behavior                                                            |
| --------- | -------------- | ------------------------------------------------------------------- |
| Active    | Normal account | Full access per auth tier                                           |
| Suspended | Admin action   | Account access restricted; admin-only action from `/user/:id/admin` |

## Surfaces

| Surface             | Route pattern                             | Visibility                                                   |
| ------------------- | ----------------------------------------- | ------------------------------------------------------------ |
| User search         | `/users`                                  | Signed-in only                                               |
| Profile Overview    | `/user/:idOrUsername`                     | Public                                                       |
| Profile collections | `/user/:idOrUsername/:collection/:scope?` | Public, subject to owner privacy                             |
| Admin page          | `/user/:idOrUsername/admin`               | Staff only. Web: admin or CS. Native grant card: admin only. |
| Owner collections   | `/my/*`                                   | Owner only                                                   |
| Email settings      | `/my/notification-settings`               | Owner only                                                   |
| Email unsubscribe   | `/email/unsubscribe`                      | Public, signed token                                         |

## List-Item / Card Anatomy

User list rows (search results, followers, following lists):

| Element       | Shows                     | Visible when                                          |
| ------------- | ------------------------- | ----------------------------------------------------- |
| Username      | Linked to profile         | Always                                                |
| Display name  | Shown alongside username  | When set                                              |
| Email         | Primary email address     | Administrator on `/users` search only, when available |
| Status        | Active or Suspended       | Administrator on `/users` search only                 |
| Follow button | Follow / Following toggle | Signed-in, non-self viewers                           |
| Mute          | Mute toggle               | Signed-in, non-self viewers                           |

Block controls are restricted to the user actions aside on the profile page — not shown in list rows. Mute appears in both list rows and the actions aside.

## Detail Anatomy

**Profile header** (top of every profile page):

| Element          | Shows                                                                        | Visible when        |
| ---------------- | ---------------------------------------------------------------------------- | ------------------- |
| Avatar           | Profile image                                                                | Always              |
| Display name     | User's display name                                                          | Always              |
| Username         | `@username`                                                                  | Always              |
| Profile links    | 44×44 icon anchors with `target='_blank' rel='nofollow noopener noreferrer'` | When set            |
| RSS feed icon    | Always the last icon in the icon row                                         | Always              |
| Follow button    | Follow / Following toggle                                                    | Signed-in, non-self |
| Subscribe button | Subscribe to user's posts (rendered in the actions aside, not the header)    | Signed-in, non-self |

**Public profile navigation:**

| Primary item | Contextual views                    | Public route family                     |
| ------------ | ----------------------------------- | --------------------------------------- |
| Overview     | None                                | `/user/:id`                             |
| Posts        | All, Reviews, Discussions, Comments | `/user/:id/{posts,reviews,...}`         |
| Topics       | Following                           | `/user/:id/topics/following`            |
| Friends      | Following, Followers                | `/user/:id/users/{following,followers}` |
| Sources      | All, News, Podcasts, Videos         | `/user/:id/rss-feeds/following`         |
| Communities  | Member                              | `/user/:id/communities/member`          |

All explicit collections are public subject to server-enforced owner and row privacy. They use
cursor pagination and retain the full profile header and viewer-appropriate actions. Web presents
contextual views as dropdowns; Swift and .NET use a second native tab row. The root body remains
client-specific: Swift retains its root analytics affordances and .NET retains its embedded All
history.

Owner-private collections live under `/my/*`. Legacy owner-private `/user/:id/*` paths redirect to
their `/my/*` equivalents; they are not public profile tabs. See the
[User Profile Tab Matrix](../users/USER-PROFILE-TAB-MATRIX.md) for the canonical route, visibility,
count, and filter contract.

**Sidebar asides** (user profile pages, in render order):

| Order | Aside                           | Auth condition      | Notes                                                                               |
| ----- | ------------------------------- | ------------------- | ----------------------------------------------------------------------------------- |
| 1     | Share landing page banner       | Owner only          | Clipboard share shortcut                                                            |
| 2     | Actions (Mute + Block)          | Signed-in, non-self | Block restricted to this aside only                                                 |
| 3     | Trust election card             | Signed-in, non-self | Vouch, Like, Neutral, Dislike, or Disavow; only Disavow auto-mutes + auto-unfollows |
| 4     | Trust follow context            | Signed-in, non-self | "From People You Follow" — positive / negative split                                |
| 5     | User tags                       | Signed-in, non-self | Net-positive tags with inline voting and a Manage modal                             |
| 6     | Popular communities (accordion) | All viewers         |                                                                                     |

**Trust signal rules:**

- Self-targeted views render **no** election, follow-context, or user-tag cards.
- Anonymous viewers **never** see trust-vote or user-tag voting controls.
- Vote totals and the viewer's current vote are visible to **admins only** — not exposed to other
  users for trust choices. User-tag vote totals and the viewer's tag vote follow the normal tag
  model and are visible to signed-in viewers.
- Clear or changing a Disavow does not undo the automatic mute or re-create any follow.
- Following a user auto-casts Like (+1) (issue #7257). Unlike Disavow, this coupling is
  one-directional: unfollowing does not retract the Like. Official accounts and accounts that
  are not contribution-eligible (no verified non-disposable email) never cast this auto-Like —
  the follow itself still succeeds.
- User tags are limited to the curated `Bot` and `Spammer` topics. The aside shows net-positive
  tags; the modal shows every allowed tag and contested relation. Tag votes have no mute,
  unfollow, or notification side effects.

## Actions

| Action              | Who can act                 |
| ------------------- | --------------------------- |
| Follow / Unfollow   | Signed-in, non-self viewers |
| Subscribe           | Signed-in, non-self viewers |
| Mute / Unmute       | Signed-in, non-self viewers |
| Block / Unblock     | Signed-in, non-self viewers |
| Trust choice        | Signed-in, non-self viewers |
| User tags           | Signed-in, non-self viewers |
| Report              | Signed-in, non-self viewers |
| Edit profile        | Owner (self)                |
| Suspend / Unsuspend | Admins only                 |

Blocking a user implicitly removes any active follow on that user.

## Related

- [post](./post.md) — posts authored by this user
- [community](./community.md) — communities the user belongs to
- [referral-link](./referral-link.md) — referral links owned by this user
