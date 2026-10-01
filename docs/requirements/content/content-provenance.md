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
| `created_via`                 | Required `content_creation_channels`; no default                                             |
| `created_via_oauth_client_id` | FK → `oauth_clients.id`, `ON DELETE RESTRICT`; set only when `created_via` is `api` or `mcp` |

The tables are `posts` (including comments, stories and topic recommendations), `communities`,
`topics`, `lists`, `rss_feeds`, `moderation_reports`, `moderation_appeals`,
`community_applications` and `user_referral_program_links`. `conversation_messages` gains the same
columns in a later stage, together with its writers.

Invariants and what enforces each:

- **Client only on agent channels:** `<table>_created_via_oauth_client_id_check` rejects an OAuth
  client on any channel other than `api` or `mcp`.
- **Immutable:** the `<table>_content_provenance_immutable` trigger fires `AFTER UPDATE` only when
  either column changes, and `fn_prevent_content_provenance_update()` rejects the change. Provenance describes the row's creation, so an
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

Client ID Metadata Document clients store their exact Client Identifier URL in `metadata_url`;
dynamically registered clients keep it `NULL`. Administrators set and clear `verified_at` and
`verified_by_id` for dynamically registered clients through the
[OAuth client verification routes](../api/v1/admin/README.md), and renaming a client
or replacing its redirect URIs clears them. Labels stay generic until the exposure stage below.

The enum, columns, checks, indexes and immutability triggers live in the canonical table creators.
The `0726-00-01` through `0726-00-09` migrations add the cross-file OAuth client foreign keys.
`created_via` is `NOT NULL` with no default on all nine tables; fresh-bootstrap seeds explicitly
record `system`. See the [prelaunch schema policy](../../development/postgres-schema-rules.md#prelaunch-relational-storage).
[`schema-content-provenance.test.mts`](../../../backend/data-stores/psql/__tests__/schema-content-provenance.test.mts)
checks every table's columns, validated constraints, valid index and trigger, the trigger on a real
`posts` partition row, the OAuth client label columns, and that no view references either
provenance column.

## Recording

Every creation service requires a typed `ContentProvenance`. The union permits an OAuth client
only for `api` and `mcp`, matching the database check. One pure resolver maps the request origin:

| Origin                | Recorded channel                            | OAuth client               |
| --------------------- | ------------------------------------------- | -------------------------- |
| REST session          | Validated client (`web`, `swift`, `dotnet`) | None                       |
| MCP API key           | `mcp`                                       | None                       |
| MCP OAuth             | `mcp`                                       | Issuing `oauth_clients.id` |
| REST API key or OAuth | `api`                                       | Issuing client for OAuth   |

REST API-key and OAuth writes have no route producer yet. Request handlers pass request
provenance; queue jobs, config-driven seeds, fixtures and scripts pass `system`. Platform-authored
StoryTeller posts and ban-evasion reports always record `system`, even when a request triggered
the work. A revived row preserves its original provenance.

### Unclassified session writes fail closed

A session origin with missing or invalid client information cannot create content. Creation
routes return `400` with `INVALID_CLIENT_INFO`, including while client metadata enforcement is
in observe mode. This prevents an unknown channel from being recorded.

## Delivery scope

[#611](https://github.com/vouchington/vouchington/issues/611) delivers writers, seeds and required
schema together as one current contract. There is no historical untracked-row state or separate
Contract stage. [#706](https://github.com/vouchington/vouchington/issues/706) owns public “via API”
and “via MCP” labels and staff visibility; these columns remain private until that stage.
