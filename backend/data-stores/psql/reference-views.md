# Views

[Back to PostgreSQL Data Store](README.md#views)

- Views should expose user-facing data, not internal hashes, embeddings, or search vectors.
- If a relation is returned as embedded JSON, the raw foreign-key column usually does not need to
  be duplicated in the same view payload.
- Use exactly one file per managed view.
- Prefer durable `CREATE OR REPLACE VIEW` statements in `views/**`.
- Write managed views as `CREATE OR REPLACE VIEW name AS SELECT ...;` without outer parentheses
  around the `SELECT`. This keeps view SQL parseable by Squawk, which runs against `views/**`.

### `view_embedded_users` vs `view_users_public`

`view_embedded_users` is the lightweight projection: it uses CASE + scalar subqueries for
`display_account` instead of 7 OAuth `LEFT JOIN`s, which dramatically reduces planning overhead
when the planner evaluates the outer view for a single-row lookup.

`view_users_public` extends `view_embedded_users`; it joins `users` and adds `markdown`,
visibility-gated verification fields, the derived `verified_display_name`, and
`lingua_rs_detected_language`. Verification columns are populated only when the user is verified
and has made the verified badge visible; `verified_display_name` is derived from the selected
public verified-name display. This makes the view the intentionally redacted public projection for
top-level user lookups (e.g. `getPublicUserByAny` and batch user fetches), where user rows are the
primary result set.

Use `view_embedded_users` (via scalar subquery) when nesting user data as JSON inside another
entity's view (e.g. `created_by`, `updated_by` in `view_posts` and `view_topics`).

**Do not** `LEFT JOIN view_users_public` inside another view — use scalar subqueries to
`view_embedded_users` instead:

```sql
(SELECT ROW_TO_JSON(eu.*) FROM view_embedded_users eu WHERE eu.id = posts.created_by_id) AS created_by
```
