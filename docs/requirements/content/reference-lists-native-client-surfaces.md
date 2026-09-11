# Lists reference

[Back to Lists](LISTS.md)

## Native Client Surfaces

Swift and .NET clients share the web list API contract through `api-fixtures/v1` fixtures:
`native.lists.default`, `native.list-items.default`, `native.lists-containing.default`, and
`native.list-import.default`.

| Client | Surface                              | Notes                                                                                                                       |
| ------ | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Swift  | Native lists surface for `/my/lists` | Native My Lists index, create/edit/delete, selected-list item view, All/Reading/Watch/Listen filters, and community import. |
| .NET   | `ListsPage` / `ListsViewModel`       | Native My Lists index, create/edit/delete, selected-list item view, All/Reading/Watch/Listen filters, and community import. |

Native list item rows currently render junction metadata (`item_type`, `entity_id`, `media_type`)
because `GET /api/v1/lists/:id/items` does not yet embed full post/feed-item entities. Full native
card rendering should wait for P3 entity embedding.

### Podcast queue (P5)

`PodcastPlayerProvider` (in `web/lib/podcast-player/context.tsx`) exposes `setQueue(episodes)`.
When a list page's audio items are loaded, callers can pass the ordered episode list to
`setQueue`; on `ended`, the player advances to the next episode automatically.
