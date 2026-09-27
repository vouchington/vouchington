# Entity links

- `entity-href.ts` owns entity URLs; use helpers, never inline templates (`web-no-inline-entity-href`). Signatures belong in [README.md](../../../docs/overview/architecture/web/lib/links/README.md); domain contracts belong in [ENTITIES.md](../../../docs/requirements/ENTITIES.md).
- Entity-relations APIs receive `topic.id`/`topicApiId(topic)`, never slugs. Tag-management helpers may use slugs, but pages resolve UUIDs before API calls.
- `landingPageHref` is external/marketing only; in-app user links use `userHref`.
- Available Topics use `topicHref`/`topicManagementHref`; collection/search/create routes are not detail URLs without dedicated helpers.
