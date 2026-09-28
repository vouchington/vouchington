# Lists reference

[Back to Lists](LISTS.md)

## Phased Roadmap

| Phase | Status          | Description                                                                                                                                                                                                             |
| ----- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1    | Shipped (#6432) | Schema, service, 11 API endpoints, web pages, sidebar group, stub Add-to-List                                                                                                                                           |
| P2    | Shipped         | Read/unread state tables + API; `read` filter on list-items and rss-feed-items; full Add-to-List checklist dialog; list detail tabs (All/Reading/Watch/Listen) + Load-more cursor; canonical `ListItemRow`; OG metadata |
| P3    | Planned         | Sharing/visibility: flip `lists.visibility`; logged-out SSR for `/list/[id]`; entity embedding in list-items API for full canonical card render                                                                         |
| P4    | Shipped (P2 PR) | Import a community list: `POST /api/v1/lists/:id/import` + community import dialog                                                                                                                                      |
| P5    | Shipped (P2 PR) | Audio autoplay-next: `setQueue` in `PodcastPlayerProvider`; `ended` handler advances to next queued episode                                                                                                             |

## See Also

- [Entity anatomy: list](../anatomy/list.md)
- [Entity × Action Matrix — list](../ENTITY-ACTION-MATRIX.md)
- [Entity × Lifecycle Matrix — list](../ENTITY-LIFECYCLE-MATRIX.md)
- [Canonical component registry](../navigation/reference-components-canonical-entity-list-item-components.md#canonical-component-registry)
- [Community Lists](../community/community-lists.md) — structural template
- [Podcasts](./PODCASTS.md) — audio content surfaced in lists via `media_type='audio'` filter
