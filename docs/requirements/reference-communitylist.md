# `community_list`

[Back to Entity × Action Matrix reference](reference-entity-action-matrix-table-b-entity-action-description.md)

| Action                                                                           | Predicate                     | Description                                                    | Endpoint                                                       | Component                                                        |
| -------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------- |
| <a name="community_list--proxy-follow--proxy-mute"></a>Proxy-Follow / Proxy-Mute | `proxy_follow` / `proxy_mute` | Apply follow / mute to every entity in the list in one action. | `PUT /api/v1/bookmarks/community_list/:id/proxy_follow` (etc.) | `web/components/communities/community-proxy-bookmark-button.tsx` |
