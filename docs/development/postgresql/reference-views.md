# Views

[Back to PostgreSQL Data Store](README.md#contents)

- Views expose user-facing data, not internal hashes, embeddings, or search vectors.
- `view_users_public` is the intentionally redacted public projection for top-level user lookups.
  The caller picks user ids first, then reads the view by those ids; it never filters, sorts, or
  pages on view columns ([R6](../postgres-schema-rules.md#r6--query-shape)).
- Nest user data inside another entity's view through a scalar subquery to `view_embedded_users`,
  never a `LEFT JOIN view_users_public`; see the pull-up rule in
  [Migrations, Views, and Config-Driven](reference-migrations-views-and-config-driven.md#view-composition-and-the-eligibility-view-pull-up-rule).
- Write managed views as `CREATE OR REPLACE VIEW name AS SELECT ...;` without outer parentheses so
  Squawk can parse them. A materialized view replaced on every `runViews` is dropped first, marked
  `squawk-ignore ban-drop-view`, because there is no `CREATE OR REPLACE MATERIALIZED VIEW`.
