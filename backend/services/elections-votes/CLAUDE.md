# Elections & Votes — Agent Rules

Config-driven service for election voting across 7 entity types. Architecture, entity type table,
shared factories, caching, and route factory usage: [README.md](README.md). This file holds
agent-only rules beyond [../CLAUDE.md](../CLAUDE.md) and [../../CLAUDE.md](../../CLAUDE.md).

## Rules

- Define vote tables, their columns, indexes, and triggers through the config-driven generators
  under [`data-stores/psql/config-driven/`](../../data-stores/psql/config-driven/). Columns on the
  six entity tables that persist derived vote aggregates follow the repository's normal schema
  placement policy; before launch, fold them into each entity table's original migration.
- When changing topic vote behavior, remember topic rating stats depend on topic votes as well as
  reviews, so the topic vote write path must enqueue topic rating-stat updates. Topic vote rating
  refresh is intentionally asynchronous and debounce-friendly; do not await that enqueue on the
  vote write path.
- When adding vote service variants, prefer shared helpers in
  [`shared/entity-service.mts`](shared/entity-service.mts) and keep per-entity files only for
  actual special cases.
- When adding new PUT vote endpoints, use `createVoteHandler()` from
  [`../../api/election-vote-handler.mts`](../../api/election-vote-handler.mts).

## See Also

- Service architecture and usage: [README.md](README.md)
- Services conventions: [../CLAUDE.md](../CLAUDE.md)
- Backend rules: [../../CLAUDE.md](../../CLAUDE.md)
