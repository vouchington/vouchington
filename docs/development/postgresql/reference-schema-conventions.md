# Schema Conventions

[Back to PostgreSQL Data Store](README.md#schema-conventions)

| Topic              | Rule                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PostgreSQL version | PostgreSQL 18+                                                                                                                                                                       |
| IDs                | Use `UUIDv7` or generated integer identities                                                                                                                                         |
| Timestamps         | Use `TIMESTAMPTZ`, not `TIMESTAMP`                                                                                                                                                   |
| Index names        | `idx_<table>__<suffix>` or UNIQUE `uq_`; at most 63 bytes                                                                                                                            |
| Trigger names      | Prefix with `trigger_`                                                                                                                                                               |
| Function names     | Helpers use `fn_`; trigger functions use the [closed R5 verb list](../postgres-schema-rules.md#r5--helpers-not-copies)                                                               |
| View names         | Prefix with `view_` or `view_embedded_`                                                                                                                                              |
| Table names        | Plural owner/thing names; only the last word is plural                                                                                                                               |
| R1: names          | [Full words, owner/thing names, subtype names, and expandable index names](../postgres-schema-rules.md#r1--names-explain-the-stored-thing-in-full-words)                             |
| R2: columns        | [Type/target suffixes, enums or lookups, lifecycle timestamps, and trigger-owned updates](../postgres-schema-rules.md#r2--columns-say-their-type-and-target)                         |
| R3: references     | [Concrete foreign keys, retained identities, typed child rows, arrays, and submitted URLs](../postgres-schema-rules.md#r3--normalize-ids-are-fk-columns-json-is-for-schemaless-data) |
| R4: shapes         | [Revisions, changes, work items with fenced leases, and per-job cursors](../postgres-schema-rules.md#r4--one-shape-per-concept)                                                      |
| R5: helpers        | [Generic trigger functions, composite parent FKs, shared tables, and exclusive arcs](../postgres-schema-rules.md#r5--helpers-not-copies)                                             |
| R6: queries        | [Partition bounds, actor-keyed rate limits, explicit columns, and keyset pagination](../postgres-schema-rules.md#r6--query-shape)                                                    |
| R7: comments       | [Table, column, generated-table, and privacy-boundary view comments](../postgres-schema-rules.md#r7--every-table-column-and-view-has-a-comment)                                      |

Session and vote user agents share the insert-only `user_agent_strings` lookup. Each normalized
string has one row and no source discriminator or `updated_at`; see
[shared lookup rules](../postgres-schema-rules.md#shared-lookup-tables).

Relation votes use metadata-generated standalone RANGE parents with table-level composite foreign
keys. The shared index-name builder retains owner words while fitting 63 bytes; cross-family reads
use the enum-tagged generated union view. See the
[R3 contract](../postgres-schema-rules.md#r3--normalize-ids-are-fk-columns-json-is-for-schemaless-data).
