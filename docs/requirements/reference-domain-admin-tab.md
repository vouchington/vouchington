# `domain` (admin tab)

[Back to Admin Navigation Matrix reference](reference-admin-navigation-matrix-table-b-entity-action-description.md#domain-admin-tab)

| Action             | Description                                                                                 | Route                   | File path                                                    | Navigation path(s)                                            |
| ------------------ | ------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| View Admin Details | View admin-only fields (blocked, crawlable, link_rel_follow) and crawler links on a domain. | `/domain/:idOrHostname` | `web/components/domains/domain-admin-details.tsx` (inferred) | inline: from `/domains` row (admin tab visible to admin only) |
