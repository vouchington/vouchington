# Entity Link Helpers

`entity-href.ts` is the public source of truth for entity URLs. Use its helpers instead of
hand-built path templates. Enforced by `web-no-inline-entity-href`. Signatures and usage:
[README.md](README.md).

## Invariants

- Entity-relations API calls pass `topic.id` or `topicApiId(topic)` — never a slug.
- Tag-management links may use slugs (`topicTagsHref` / `postTagsHref`); the page resolves to UUID
  before calling the API.
- `landingPageHref` is for external/marketing surfaces only. In-app user links use `userHref`.
- When a `Topic` is available, use `topicHref` or `topicManagementHref`. Collection/search/create
  routes are not entity detail URLs unless a dedicated helper exists.

## See Also

- [README.md](README.md)
- [ENTITIES.md](../../../docs/requirements/ENTITIES.md)
