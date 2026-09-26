# Content Provenance

Which channel created each piece of user content, and which OAuth client acted when an agent did.

## Why

- Voucha can't block AI agents. It steers them to the API and MCP
  ([agent access](../platform/agent-access.md)) and shows users when content arrived through those
  paths ([#237](https://github.com/vouchington/vouchington/issues/237)).
- Provenance is **declared** by the credential that made the write. The `ai-generated` moderator
  label is **detected** from the text by the moderation pipeline
  ([`moderator-labels.mts`](../../../backend/services/moderation/moderator-labels.mts)). The two
  answer different questions and neither replaces the other.

## Channels

`content_creation_channels` is the Postgres enum for the channel that created a row.

| Channel  | Created by                                          | Trust                                                            |
| -------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| `web`    | The Voucha web app                                  | Telemetry-grade: derived from forgeable request headers          |
| `swift`  | The Swift clients                                   | Telemetry-grade                                                  |
| `dotnet` | The .NET clients                                    | Telemetry-grade                                                  |
| `api`    | The REST API, called with an API key or OAuth token | Credential-grade: derived from the credential that authorized it |
| `mcp`    | The user MCP server                                 | Credential-grade                                                 |
| `system` | A platform job                                      | Server-assigned                                                  |

[Request client info](../../overview/architecture/request-client-info.md) owns how the edge and
backend classify first-party clients, and why that classification can be forged. Only the
credential-grade channels may be shown publicly.

## Data Model

Every user-content table carries two columns:

| Column                        | Notes                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| `created_via`                 | `content_creation_channels`; `NULL` for rows written before provenance tracking              |
| `created_via_oauth_client_id` | FK → `oauth_clients.id`, `ON DELETE RESTRICT`; set only when `created_via` is `api` or `mcp` |

The tables are `posts` (including comments, stories and topic recommendations), `communities`,
`topics`, `lists`, `rss_feeds`, `moderation_reports`, `moderation_appeals`,
`community_applications` and `user_referral_program_links`. `conversation_messages` gains the same
columns in a later stage, together with its writers.

Invariants and what enforces each:

- **Client only on agent channels:** `<table>_created_via_oauth_client_id_check` rejects an OAuth
  client on any channel other than `api` or `mcp`.
- **Immutable:** the `<table>_content_provenance_immutable` trigger fires `AFTER UPDATE` only when
  either column changes, and `fn_prevent_content_provenance_update()` rejects the change, including
  setting a value on a row that predates tracking. Provenance describes the row's creation, so an
  upsert that revives an existing row keeps the original channel, and writers leave both columns
  out of `ON CONFLICT DO UPDATE SET`.
- **Clients are kept:** `ON DELETE RESTRICT` blocks deleting an OAuth client that created content.
  [OAuth authorization server](../security/OAUTH-AUTHORIZATION-SERVER.md) clients are retired by
  setting `oauth_clients.revoked_at`, and no code path deletes them.
- **Private by default:** both columns stay out of API responses until the exposure stage below
  adds a reviewed label. Tests enforce this rather than the schema: read paths select declared
  column lists whose tests assert the exact response keys (for example
  [`communities/get.test.mts`](../../../backend/services/communities/get.test.mts)), and the schema
  test below fails if a view references either column.

### OAuth Client Labels

The public label names an OAuth client only when the name can be trusted. `oauth_clients` carries
what the label needs:

| Column           | Notes                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `metadata_url`   | Unique HTTPS URL of a Client ID Metadata Document; `NULL` for dynamically registered clients |
| `verified_at`    | When staff verified a dynamically registered client's `client_name`                          |
| `verified_by_id` | FK → `users.id`, `ON DELETE SET NULL`; set only when `verified_at` is set                    |

`metadata_url` stays `NULL` until Client ID Metadata Documents ship. Administrators set and clear
`verified_at` and `verified_by_id` through the
[OAuth client verification routes](../../../backend/api/v1/admin/README.md), and renaming a client
or replacing its redirect URIs clears them. Labels stay generic until the exposure stage below.

The migrations are `backend/data-stores/psql/migrations/0726-00-*-content-provenance*.sql`.
`0726-00-00` adds the enum, trigger function and OAuth client label columns. `0726-00-01` through
`0726-00-09` each alter one table, so no transaction holds `ACCESS EXCLUSIVE` on two tables.
`0726-00-10` validates the constraints, `0726-00-11` builds the indexes online, and `0726-00-12`
attaches the `posts__default` index to its partitioned parent.
[`schema-content-provenance.test.mts`](../../../backend/data-stores/psql/__tests__/schema-content-provenance.test.mts)
checks every table's columns, validated constraints, valid index and trigger, the trigger on a real
`posts` partition row, the OAuth client label columns, and that no view references either
provenance column.

## Rollout

Provenance ships as an expand and contract change, following the
[deploy decoupling](../../overview/infrastructure/deployment.md#deploy-decoupling--independent-safety)
rules. Each stage is a sub-issue of [#237](https://github.com/vouchington/vouchington/issues/237).

| Stage    | Change                                                                                  | Status  |
| -------- | --------------------------------------------------------------------------------------- | ------- |
| Expand   | Nullable columns, constraints and immutability trigger on every table                   | Shipped |
| Record   | Every writer records its channel and OAuth client; seeds and jobs record `system`       | Planned |
| Expose   | Public "via API" and "via MCP" labels; staff see every channel                          | Planned |
| Contract | A validated `CHECK` requires provenance on rows created after each table's writer ships | Planned |

The Record stage includes writers outside request handlers: queue jobs, and the config-driven seeds
that insert topics and communities on every deploy
([`0005-00-01-seed-topics.mts`](../../../backend/data-stores/psql/config-driven/0005-00-01-seed-topics.mts),
[`0080-00-01-publisher-type-topics.mts`](../../../backend/data-stores/psql/config-driven/0080-00-01-publisher-type-topics.mts)
and
[`0140-00-01-seed-communities.mts`](../../../backend/data-stores/psql/config-driven/0140-00-01-seed-communities.mts)).
They record `system`, or the Contract stage's `CHECK` rejects their inserts.
