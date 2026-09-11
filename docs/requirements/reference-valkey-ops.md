# `valkey` (ops)

[Back to Admin Navigation Matrix reference](reference-admin-navigation-matrix-table-b-entity-action-description.md#valkey-ops)

| Action               | Description                                                                | Route           | File path                                      | Navigation path(s)                             |
| -------------------- | -------------------------------------------------------------------------- | --------------- | ---------------------------------------------- | ---------------------------------------------- |
| Bloom Filter Config  | View and update bloom filter configuration.                                | `/admin/valkey` | `web/app/admin/valkey/page.tsx`                | sidebar: Engineering → Valkey; command: Valkey |
| Bloom Filter Rebuild | Rebuild the bloom filter from source data.                                 | `/admin/valkey` | `web/app/admin/valkey/page.tsx`                | sidebar: Engineering → Valkey; command: Valkey |
| Cache Management     | Inspect and evict cache entries.                                           | `/admin/valkey` | `web/app/admin/valkey/page.tsx`                | sidebar: Engineering → Valkey; command: Valkey |
| Flush                | Flush all Valkey keys for a scoped concern (caches, blooms, queues, etc.). | `/admin/valkey` | `web/app/admin/valkey/flush-concerns-card.tsx` | sidebar: Engineering → Valkey; command: Valkey |
