# Entity links

- Entity-relations APIs receive `topic.id`/`topicApiId(topic)`, never slugs. Tag-management helpers may use slugs, but pages resolve UUIDs before API calls.
- Page helpers emit the entity's slug or natural key; an id-only page helper is only for entities without one.
- `landingPageHref` is external/marketing only; in-app user links use `userHref`.
- Available Topics use `topicHref`/`topicManagementHref`; collection/search/create routes are not detail URLs without dedicated helpers.
