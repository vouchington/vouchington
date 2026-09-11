# Entity Anatomy

One-stop reference for what each entity looks like — data shape, lifecycle states, rendered
surfaces, and available actions. Use these docs when designing new surfaces, reviewing UI changes,
or planning migrations.

**Sync rule:** when an entity's fields, states, or surfaces change (migrations, enum additions, new
actions, surface renames), update the matching anatomy file here and keep it in sync with the
[Entity × Action Matrix](../ENTITY-ACTION-MATRIX.md),
[Entity × Lifecycle Flow Matrix](../ENTITY-LIFECYCLE-MATRIX.md),
[Canonical Entity List-Item Components](../navigation/COMPONENTS.md#canonical-entity-list-item-components), and
[Asides](../navigation/ASIDES.md).

## Entities

| Entity                                        | Purpose                                                                |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| [topic](./topic.md)                           | Knowledge entity representing a product, service, creator, or concept  |
| [source](./source.md)                         | RSS feed / content source (a special topic type)                       |
| [fediverse-instance](./fediverse-instance.md) | Federated server directory entry (a special topic type)                |
| [source-item](./source-item.md)               | Individual RSS feed item (article, podcast episode, video)             |
| [post](./post.md)                             | User-created content (review, discussion, data point, etc.)            |
| [list](./list.md)                             | User-curated named collection of articles, episodes, videos, and posts |
| [referral-link](./referral-link.md)           | User-submitted affiliate/referral URL for a referral program           |
| [community](./community.md)                   | User-created space for topic-focused discussion                        |
| [user](./user.md)                             | Registered account and public profile                                  |
| [notification](./notification.md)             | Per-user inbox event with structured navigation and delivery state     |
| [domain](./domain.md)                         | Web hostname with a community trust rating                             |
| [url](./url.md)                               | Crawled web URL and its associated metadata                            |
