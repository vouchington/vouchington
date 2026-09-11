# Communities

See also: [Entity × Action Matrix — community](../reference-community.md#community) · [Entity × Lifecycle Flow Matrix — community](../reference-communities.md#communities)

Communities are user-created spaces for topic-focused discussion. Owners and moderators manage membership, community post review, and community settings.

## Community Creation

Any authenticated user with a username may create communities. There is no limit on how many communities a user may own.

**Name rules:**

- Must have at least 3 words
- Must be trimmed (no leading or trailing whitespace)
- Must be between 1 and 100 characters

**Slug rules:**

- Optional. When omitted, automatically generated as `slug(name)-<base36-uuid-suffix>` (the same pattern used for post slugs, ensuring uniqueness via the UUID suffix).
- When provided, must match `^[a-z0-9-]+$` and be at most 80 characters.

A username is the only requirement for creation. The creation route returns HTTP 403 with code `IDENTITY_REQUIRED` when no username is set.

Signed-in users can reach the creation form via a "Create Community" button on the `/communities` index page and via a "Create Community" menu item in the Communities sidebar group. Both entry points are hidden from signed-out users (the sidebar group itself is only rendered for authenticated users).

New communities can host member posts and curated lists as soon as they are created.

## Community Navigation

Community navigation uses a shadcn menubar and depends on enabled surfaces and the current user's
role. See [Community Anatomy — Detail Anatomy](../anatomy/community.md#detail-anatomy) for the full
menubar item set (items, routes, and role visibility).

Key visibility rules:

- **News** tab is shown only when the community has active topic or RSS feed list items.
- **Settings** is shown to **owners only**.
- **Moderation** and **Pinned Posts** are shown to **owners and moderators**.
- Pinned posts appear at the top of the Posts tab page above the normal post list.

Visible breadcrumbs render above the community header and menubar.

Native clients must route supported community URLs to native surfaces rather than WebView or
open-web fallbacks. Public browse/detail routes remain readable when signed out; authenticated
actions such as create, apply, invite redemption, join/leave, archive/unarchive, and community-post
creation queue until sign-in when needed. CAPTCHA-gated native community actions follow the shared
[CAPTCHA & Bot Protection](../../overview/architecture/captcha.md) contract: Apple-platform clients
prefer App Attest assertions and fall back to the native Turnstile challenge only when App Attest is
unavailable, while other native clients must provide a valid Turnstile token for protected endpoints.

## Community Member Roster Privacy

Communities control regular member row visibility with `member_roster_visibility`:

- `public` — anyone who can view the community can see regular members
- `users` — signed-in users can see regular members
- `members` — active community members can see regular members
- `moderators` — only owners, moderators, and admins can see regular members

Owners and moderators are always shown in the roster to viewers who can view the community. Regular
members can further hide their own row with `community_memberships_visibility`; admins and community
owners/moderators bypass both filters for moderation.

## Community Posts

Posts are either global or scoped to exactly one community via `posts.community_id`. Community posts
are created through `POST /api/v1/communities/:idOrSlug/posts`; global `POST /api/v1/posts` rejects
community scope fields.

Community posts support two visibility modes:

- public: `broadcast='everyone'`, `privacy='public'`
- signed-in-only: `broadcast='users'`, `privacy='private'`

Private communities only allow signed-in-only community posts so direct post URLs do not bypass the
community membership boundary. Direct reads of posts scoped to a private community require active
community membership, even when the post URL is known.

Each community post has one `community_post_reviews` row for pending/approved/rejected/unpublished
state. A public global post may be cross-posted into a community by creating a community-scoped
`discussion` whose `parent_id` points to the global source post.

The canonical community post feed is `/communities/:slug/posts`. It uses the shared post search
field and supports `sort=new` and `sort=hot`; the default is `new`. Pinned posts appear at the top of
the unfiltered first page and are excluded from the normal paginated result list to avoid duplicates.

## Auto-Archiving Rules

An archived community is read-only:

- **Locked for new members**: Join requests and invite redemptions are rejected.
- **Locked for new posts**: Community post creation is disabled.
- **Still readable**: Existing members can read all content; public communities remain visible to non-members.
- **Not deleted**: All data is preserved. An archived community can be unarchived if the owner claims it back.

## Community Browse Page

See [Community Anatomy — List-Item / Card Anatomy](../anatomy/community.md#list-item--card-anatomy).

Use a responsive grid layout (`grid-cols-1 md:grid-cols-2`) instead of full-width rows.

## Related

- [Web rules](../../../web/CLAUDE.md) — UI, routing, and client conventions
- [Backend rules](../../../backend/CLAUDE.md) — service, API, and data conventions

- Service: [backend/services/communities/README.md](../../../backend/services/communities/README.md)
- API routes: [backend/api/v1/communities/README.md](../../../backend/api/v1/communities/README.md)
- Community list requirements: [docs/requirements/community/community-lists.md](./community-lists.md)
- Docs index: [docs/README.md](../README.md)
