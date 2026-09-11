# GET /api/v1/users/:idOrSlug

[Back to Users API](README.md#get-apiv1usersidorslug)

Returns the public view of a user, or the private view if the requester is viewing their own profile.
Also returns `user_metrics`, which drives user profile tab counts:

- Public counts: `reviews`, `discussions`, `comments`, `users_following`, `users_followers`, `topics_following`, `rss_feeds_following`
- Viewer-aware counts: `viewer_count.*` for authored post tabs when the viewer can see more than the public
- Owner/admin-only counts: `private_count.*` for blocked, muted, viewed, and saved-item tabs

Cached (long TTL) for unauthenticated users.

The profile lookup route does not expose vouch-election aggregates to non-admins. Administrators
receive the `user_vouch_election` sidecar on this endpoint; non-admin viewers, including the user
on their own profile, do not see it. User tags load separately through the authenticated entity-
relations API. Clients may show the vouch card and curated user-tag controls for signed-in viewers
on other users' profiles and submit votes through `PUT /api/v1/users/:id/vouch-vote`.
