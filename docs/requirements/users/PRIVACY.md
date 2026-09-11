# Privacy Settings

Users can control who sees their activity and profile data through granular audience-based privacy settings. The cross-feature coverage source of truth is the [User Privacy Feature Matrix](./USER-PRIVACY-MATRIX.md).

## Always-Public Data

The following profile data is always public and cannot be restricted:

- Username
- Bio / profile description
- Profile links
- Profile image

## Privacy Audience Levels

| Level            | Who Can See                                 |
| ---------------- | ------------------------------------------- |
| Everyone         | All visitors (logged-in and logged-out)     |
| Logged-in Users  | Any authenticated user                      |
| Followers        | Users who follow the target user            |
| Mutual Followers | Users with a reciprocal follow relationship |
| Nobody           | Only the user themselves and admins         |

## Settings

| Setting                             | Default  | Description                                      |
| ----------------------------------- | -------- | ------------------------------------------------ |
| follows_visibility                  | everyone | Who can see your followed users                  |
| topic_follows_visibility            | everyone | Who can see your followed topics                 |
| rss_feed_follows_visibility         | everyone | Who can see your followed RSS feeds              |
| community_memberships_visibility    | everyone | Who can see your community memberships           |
| followers_visibility                | everyone | Who can see your followers list                  |
| likes_visibility                    | everyone | Who can see your vouches/votes in follow-context |
| cards_visibility                    | everyone | Who can see your cards                           |
| rewards_program_statuses_visibility | everyone | Who can see your reward program statuses         |
| spending_categories_visibility      | nobody   | Who can see your spending categories             |
| default_post_broadcast              | everyone | Default audience for new posts                   |
| default_post_privacy                | public   | Default privacy level for new posts              |
| third_party_marketing               | false    | Whether partner marketing use is allowed         |
| processing_restricted_at            | null     | Whether processing is restricted                 |

`cards_visibility`, `rewards_program_statuses_visibility`, and `spending_categories_visibility`
are stored settings. The current product has no public cards or reward-status read surface; those
surfaces remain owner/admin-only unless a separate product change adds public profile modules.

## Enforcement

- **Collection endpoints**: Each listing endpoint checks the matching visibility field:
  - `/api/v1/users/:id/users/following` — `follows_visibility`
  - `/api/v1/users/:id/users/followers` — `followers_visibility`
  - `/api/v1/users/:id/topics/following` — `topic_follows_visibility`
  - `/api/v1/users/:id/rss-feeds/following` — `rss_feed_follows_visibility`
  - `/api/v1/communities/:idOrSlug/members` — `community_memberships_visibility` for regular member rows
- **Relation management**: Saves, hides, mutes, blocks, subscriptions, recommendation dismissals,
  proxy follows, proxy mutes, and recently viewed history are private to the owner and admins for
  viewing. Only the owner gets relation action buttons because relation mutations act on the
  signed-in user's own bookmarks.
  See [User Relation Matrix](./USER-RELATION-MATRIX.md).
- **Follow-context (votes)**: Users with `likes_visibility` set to a restrictive level are excluded from follow-context vote results for unauthorized viewers
- **Follow-context (topic follows)**: Users with `topic_follows_visibility` set to a restrictive level are excluded from follow-context topic results for unauthorized viewers
- **Community memberships**: Community member rosters enforce each regular member's
  `community_memberships_visibility`. Owners and moderators remain visible to anyone who can view
  the community. Communities can also restrict regular roster rows with
  `member_roster_visibility`: `public`, `users`, `members`, or `moderators`.
- **Post creation**: New posts default to the user's `default_post_broadcast` and `default_post_privacy` settings
- **Consent and processing controls**: `third_party_marketing` is exported with account data and
  used as the marketing-consent source. `processing_restricted_at` preserves the user row while
  excluding the user from recommendation/search processing surfaces that honor processing
  restriction.
- **Denial response**: Unauthorized access returns 404 (not 403) to avoid confirming restricted content exists

## Admin Override

Administrators can always view all user content regardless of privacy settings.

## Related

- [Web rules](../../../web/CLAUDE.md) — UI, routing, and client conventions
- [Backend rules](../../../backend/CLAUDE.md) — service, API, and data conventions
- [User Relation Matrix](./USER-RELATION-MATRIX.md)
- [User Privacy Feature Matrix](./USER-PRIVACY-MATRIX.md)

- [docs/requirements/navigation/ACCESSIBILITY.md](../navigation/ACCESSIBILITY.md)
- [docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md](./ACCOUNT-DELETION-DATA-REQUEST.md)
