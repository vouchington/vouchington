# `rss_feed`

[Back to Entity × Action Matrix reference](reference-entity-action-matrix-table-b-entity-action-description.md)

| Action                                                   | Predicate   | Description                                                                                                          | Endpoint                                       | Component                                          |
| -------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| <a name="rss_feed--follow"></a>Follow                    | `follow`    | Follow source; its items appear in the user's feed. Signed-out → `/login`.                                           | `PUT /api/v1/bookmarks/rss_feed/:id/follow`    | `web/components/shared/follow-button.tsx`          |
| <a name="rss_feed--subscribe-news"></a>Subscribe to News | `subscribe` | Backend relation active; **UI removed** (#6223). Notifies user when new articles are published from this source.[^1] | `PUT /api/v1/bookmarks/rss_feed/:id/subscribe` | `web/components/shared/entity-bookmark-button.tsx` |
| <a name="rss_feed--mute"></a>Mute                        | `mute`      | Hides this source from feed. Auth-only.                                                                              | `PUT /api/v1/bookmarks/rss_feed/:id/mute`      | `web/components/shared/entity-bookmark-button.tsx` |

[^1]: On `rss_feed` the predicate is `subscribe` — `subscribe_rss_feed_items` exists only on `topic` to disambiguate from `subscribe_posts`. An rss_feed has only one subscribable stream so the shorter predicate is unambiguous.
