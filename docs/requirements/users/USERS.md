# Users

See also: [Entity × Action Matrix — user](../reference-user.md#user) · [Entity × Lifecycle Flow Matrix — user](../reference-users.md#users) · [User Relation Matrix](./USER-RELATION-MATRIX.md)

## Profile Overview

- `/users` is a signed-in user search page. Non-admin users search public profiles by username
  prefix. Admins use the same page and additionally see user status, email when available, and a
  direct management link to `/user/:idOrUsername/admin` that prefers the username and falls back
  to the id; the link is `administrator`-only. Native clients (Swift and .NET) render the
  same administrator-only status, email when available, and management link.
- `/user/:idOrUsername` is the canonical, indexable user profile page.
- `/user/:idOrUsername/admin` is staff-only. Web allows `administrator` to
  open the page. The identity-verification retry grant is administrator-only. Native clients render
  that grant form on the same route, reached from the profile header Admin button, the `/users`
  search result row's management link, or `voucha://user/:idOrUsername/admin`. Native does not
  render suspend, warnings, or refunds there.
- User profile structured data must use `ProfilePage` with `Person` as `mainEntity`.
- The overview page keeps the canonical URL for the user even when tab subpages exist.
- Authenticated viewers see the semantic trust-election card and community-driven user tags on
  other users' profile pages. See [User Anatomy — Detail Anatomy](../anatomy/user.md#detail-anatomy)
  for sidebar placement order and visibility rules.
- The profile payload and page UI must not expose trust-vote totals or the viewer's current vote to
  non-admin viewers. Admin viewers receive the trust aggregate sidecar on
  `GET /api/v1/users/:idOrSlug` for moderation tooling.
- Anonymous viewers must not see trust-vote or user-tag controls.
- Voting `Disavow` auto-mutes and auto-unfollows the target user for the current viewer. Retracting
  the vote does not undo the mute or re-create the follow.
- Following a user auto-casts Like (`+1`) for the current viewer (issue #7257). This coupling
  is one-directional: unfollowing does not retract the Like. Official accounts and
  contribution-ineligible accounts (no verified non-disposable email) never cast this auto-Like —
  the follow still succeeds.
- The trust-election card has a follow-context aside directly below it that surfaces the subset
  of the viewer's followed users who voted on the same target. Self-targeted views render no
  election, follow-context, or user-tag cards.
- User tags are curated, election-backed `user → category → topic` relations. `Bot` and `Spammer`
  are the initial allowed tags. Signed-in non-self viewers vote on net-positive tags in the aside
  and manage every allowed tag in the modal. User-tag votes never mute, unfollow, or notify.
- Administrators use the same weighted user-tag vote model for moderation and bypass ordinary
  contribution and official-account restrictions. Administrators still cannot tag themselves.
- Blocking a user implicitly removes any active follow on that user. See [docs/overview/architecture/bookmarks.md](../../overview/architecture/bookmarks.md#implicit-unfollow) for the full implicit-unfollow rules.
- Mute is exposed in `UserActionsAside` on the profile page **and** in user list rows (`UserList`, `UserSearchResults` — followers, following, search results). Block remains restricted to `UserActionsAside`. Mute state in list rows is batch-loaded from the API response `muted` map (no per-row client-side fetch). See [User action buttons](../navigation/reference-actions-action-buttons-by-entity.md#users) for placement rules.
- Admin-only account suspension is exposed from `/user/:idOrUsername/admin` on web, not in public
  user list rows. Admins can reach the page from `/users` search results or the profile header
  Admin link. Native profile Admin opens the identity-verification retry form on that same route.
- Authenticated viewers (non-self) can Report a user from `UserActionsAside` alongside Block and Mute. Clicking "Report" opens `ReportDialog`. Reporter identity is never shown to the reported user. See [REPORTING.md](../moderation/REPORTING.md).

## Top-Level Menubar

The public profile uses top-level Menubar navigation. `About` is the default and resolves to the
index route `/user/:idOrUsername`. See [User Anatomy — Detail Anatomy](../anatomy/user.md#detail-anatomy) for the full menubar item set with routes and visibility.

- `About` renders the user's bio markdown (`users.markdown`) server-rendered to HTML. Owner sees a prompt to add bio when empty; other viewers see nothing.
- `Activity` sub-pills (Reviews, Discussions, Comments) render below the Menubar when that item is active.
- Relation items and subpages are documented in the [User Relation Matrix](./USER-RELATION-MATRIX.md).
- Owner/admin-only relation items and their subpages must behave as not found for unauthorized viewers. Admins can view these lists, but relation action buttons are owner-only.
- Public activity sub-pills may display `N+` / `0+` when the current viewer can see more items than the logged-out public count.

## Profile Header

See [User Anatomy — Detail Anatomy](../anatomy/user.md#detail-anatomy) for the profile header
element breakdown (profile links, RSS icon, Follow/Subscribe buttons).

## Data Requirements

- User tab counts and visibility must come from `user_metrics` on `GET /api/v1/users/:idOrSlug`.
- Do not issue probe requests just to decide whether a tab should render.
- User collection routes should return native entity payloads so the UI can render standard list components without relation-row adapters.

## Friend Recommendations

- `/my/friend-recommendations` shows paginated recommendations from supported connected-account
  providers. Each row identifies the person and provider without exposing an internal ID.
- `Follow` uses the existing user follow relation. `Dismiss` uses the dismissed-recommendation
  relation. Successful actions remove the row. Failed actions retain it and show a retryable error.
- Duplicate actions for the same person are disabled while a mutation is in flight.
- The empty state links to connected-account settings.
- `/my/friend-recommendations/dismissed` shows dismissed recommendations as a separate native tab
  or destination. Recommendation ranking and account connection are separate concerns.

## SEO

- `/user/:idOrUsername` is indexable.
- Every user profile subpage must export `createNoIndexMetadata()`.
- Subpages do not become canonical profile pages.

## Related

- [Client Parity Matrix](../CLIENT-PARITY-MATRIX.md)
- [Client feature parity contract](../client-feature-parity.json)
- [Web rules](../../../web/CLAUDE.md) — UI, routing, and client conventions
- [Backend rules](../../../backend/CLAUDE.md) — service, API, and data conventions

- [docs/requirements/navigation/ACCESSIBILITY.md](../navigation/ACCESSIBILITY.md)
- [docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md](./ACCOUNT-DELETION-DATA-REQUEST.md)
