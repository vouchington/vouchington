# User Relation Matrix

Owner/admin profile relation matrix for every active bookmark relation whose subject is `user`.
The backend source of truth is `backend/services/entity-relations/config-relations.mts`.

Public profile activity remains on `/user/:idOrUsername` and activity subpages. Relation management
subpages are noindex. Owners can remove their own relations from these pages. Admins can view
private owner/admin lists for moderation, but relation action buttons are intentionally owner-only
because bookmark mutation endpoints act on the signed-in user.

## Visibility Policy

| Visibility          | Meaning                                                                                                                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audience-controlled | Existing privacy settings decide who can view the list. Unauthorized viewers get 404.                                                                                                        |
| Owner/admin         | Only the profile owner and admins can view the list. Anonymous viewers get 401 from the API and 404 from profile pages; signed-in strangers get 403 from the API and 404 from profile pages. |

Audience-controlled lists:

- `follows_visibility` -> `/user/:id/users/following`
- `followers_visibility` -> `/user/:id/users/followers`
- `topic_follows_visibility` -> `/user/:id/topics/following`
- `rss_feed_follows_visibility` -> `/user/:id/rss-feeds/following`

All saves, hides, mutes, blocks, subscriptions, recommendation dismissals, proxy follows, proxy
mutes, and recently viewed history are owner/admin-viewable and owner-manageable.

## Entity - Relation - Page/Tab

| Entity          | Predicate / relation       | Profile page / tab            | Route                                                                       | Visibility          | Owner manage action                |
| --------------- | -------------------------- | ----------------------------- | --------------------------------------------------------------------------- | ------------------- | ---------------------------------- |
| `post`          | `save`                     | Posts / Saved                 | `/user/:id/posts/saved`                                                     | Owner/admin         | Remove save                        |
| `post`          | `hide`                     | Posts / Hidden                | `/user/:id/posts/hidden`                                                    | Owner/admin         | Unhide                             |
| `post`          | `follow`                   | Posts / Following             | `/user/:id/posts/following`                                                 | Owner/admin         | Unfollow                           |
| `post`          | `subscribe`                | Posts / Subscribed            | `/my/posts/subscribed` (owner only; profile route redirects to owner page)  | Owner/admin         | Unsubscribe                        |
| `topic`         | `follow`                   | Topics / Following            | `/user/:id/topics/following`                                                | Audience-controlled | Unfollow when owner/admin          |
| `topic`         | `block`                    | Topics / Blocked              | `/user/:id/topics/blocked`                                                  | Owner/admin         | Unblock                            |
| `topic`         | `mute`                     | Topics / Muted                | `/user/:id/topics/muted`                                                    | Owner/admin         | Unmute                             |
| `topic`         | recently viewed            | Topics / Viewed               | `/user/:id/topics/viewed`                                                   | Owner/admin         | none                               |
| `topic`         | `subscribe_posts`          | Topics / Subscribed to Posts  | removed from UI (backend relation active)                                   | Owner/admin         | none (UI removed)                  |
| `topic`         | `subscribe_rss_feed_items` | Topics / Subscribed to News   | removed from UI (backend relation active)                                   | Owner/admin         | none (UI removed)                  |
| `topic`         | `dismiss_recommendation`   | Topics / Dismissed            | `/user/:id/topics/dismissed-recommendations`                                | Owner/admin         | Restore recommendation eligibility |
| `user`          | `follow`                   | Users / Following             | `/user/:id/users/following`                                                 | Audience-controlled | Unfollow when owner/admin          |
| `user`          | inbound `follow`           | Users / Followers             | `/user/:id/users/followers`                                                 | Audience-controlled | none                               |
| `user`          | `subscribe`                | Users / Subscribed to Posts   | `/my/users/subscribed-posts` (owner only; profile route redirects to owner) | Owner/admin         | Unsubscribe                        |
| `user`          | `block`                    | Users / Blocked               | `/user/:id/users/blocked`                                                   | Owner/admin         | Unblock                            |
| `user`          | `mute`                     | Users / Muted                 | `/user/:id/users/muted`                                                     | Owner/admin         | Unmute                             |
| `user`          | `dismiss_recommendation`   | Users / Dismissed             | `/user/:id/users/dismissed-recommendations`                                 | Owner/admin         | Restore recommendation eligibility |
| `rss_feed`      | `follow`                   | RSS / Followed Feeds          | `/user/:id/rss-feeds/following`                                             | Audience-controlled | Unfollow when owner/admin          |
| `rss_feed`      | `subscribe`                | RSS / Subscribed to Feeds     | removed from UI (backend relation active)                                   | Owner/admin         | none (UI removed)                  |
| `rss_feed`      | `mute`                     | RSS / Muted Feeds             | `/user/:id/rss-feeds/muted`                                                 | Owner/admin         | Unmute                             |
| `rss_feed_item` | `save`                     | RSS / Saved Items             | `/user/:id/rss-feed-items/saved`                                            | Owner/admin         | Remove save                        |
| `rss_feed_item` | `hide`                     | RSS / Hidden Items            | `/user/:id/rss-feed-items/hidden`                                           | Owner/admin         | Unhide                             |
| `rss_feed_item` | recently viewed            | RSS / Viewed Items            | `/user/:id/rss-feed-items/viewed`                                           | Owner/admin         | none                               |
| `url`           | `save`                     | Links / Saved Links           | `/user/:id/urls/saved`                                                      | Owner/admin         | Remove save                        |
| `url_hostname`  | `block`                    | Domains / Blocked             | `/user/:id/domains/blocked`                                                 | Owner/admin         | Unblock                            |
| `url_hostname`  | `mute`                     | Domains / Muted               | `/user/:id/domains/muted`                                                   | Owner/admin         | Unmute                             |
| `community`     | `save`                     | Communities / Saved           | `/user/:id/communities/saved`                                               | Owner/admin         | Remove save                        |
| `community`     | `proxy_follow`             | Communities / Proxy Following | `/user/:id/communities/proxy-following`                                     | Owner/admin         | Remove proxy follow                |
| `community`     | `proxy_mute`               | Communities / Proxy Muted     | `/user/:id/communities/proxy-muted`                                         | Owner/admin         | Remove proxy mute                  |

## Notes

**"none (UI removed)" rows** — `topic/subscribe_posts`, `topic/subscribe_rss_feed_items`, and
`rss_feed/subscribe` have their management UI removed. The backend relations remain active:
existing subscribers continue to receive notifications and the data is preserved. The UI can be
restored in a future change without any data migration. By contrast, `post/subscribe` keeps its UI
(`/my/posts/subscribed`) for reply subscriptions, and `user/subscribe` keeps its UI
(`/my/users/subscribed-posts`) because user-post subscriptions were retained in scope.

## Related

- [Users](./USERS.md)
- [Privacy](./PRIVACY.md)
- [Entity × Action Matrix](../ENTITY-ACTION-MATRIX.md)
- [Entity Relations](../../overview/architecture/entity-relations.md)
- [Bookmarks](../../overview/architecture/bookmarks.md)
