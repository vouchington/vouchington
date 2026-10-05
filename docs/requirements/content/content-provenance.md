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
`community_applications`, `user_referral_program_links`, `user_rss_feed_import_batches` and
`conversation_messages`.

`conversation_messages` is the partitioned table behind chat, direct-message, modmail and
client-generated turns. Every message records the channel of the request that sent it, so the two
messages of a client-generated turn share one channel, and a retry that replays the turn keeps the
channel of the request that stored it. The columns stay out of every conversation and message
response.

`user_rss_feed_import_batches` holds the channel of the request that submitted a user RSS feed
import. A queue job creates the feeds later, so it reads the batch's stored provenance instead of
recording `system`; each feed then carries the same channel and OAuth client as the submitting
request. Staff CSV imports (`backend/services/admin-imports`) are platform work and record `system`.

Invariants and what enforces each:

- **Client only on agent channels:** `<table>_created_via_oauth_client_id_check` rejects an OAuth
  client on any channel other than `api` or `mcp`.
- **Immutable:** the `<table>_content_provenance_immutable` trigger fires `AFTER UPDATE` only when
  either column changes, and `fn_reject_content_provenance_update()` rejects the change. Provenance describes the row's creation, so an
  upsert that revives an existing row keeps the original channel, and writers leave both columns
  out of `ON CONFLICT DO UPDATE SET`.
- **Clients are kept:** `ON DELETE RESTRICT` blocks deleting an OAuth client that created content.
  [OAuth authorization server](../security/OAUTH-AUTHORIZATION-SERVER.md) clients are retired by
  setting `oauth_clients.revoked_at`, and no code path deletes them.
- **Private by default:** neither column appears in an API response as a column. Only the derived
  [exposure](#exposure) fields do, and only for posts. Tests enforce this rather than the schema:
  read paths select declared column lists whose tests assert the exact response keys (for example
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
or replacing its redirect URIs clears them. The [exposure](#exposure) rules below turn these facts
into a label.

The enum, columns, checks, indexes and immutability triggers live in the canonical table creators.
The `0726-00-01` through `0726-00-09` migrations add the cross-file OAuth client foreign keys, and
`0726-00-11` and `0726-00-12` add the foreign key and trigger for `user_rss_feed_import_batches`
and `conversation_messages`, whose creators run before `oauth_clients` and the immutability
function exist.
`created_via` is `NOT NULL` with no default on all eleven tables; fresh-bootstrap seeds explicitly
record `system`. See the [prelaunch schema policy](../../development/postgres-schema-rules.md#prelaunch-relational-storage).
[`schema-content-provenance.test.mts`](../../../backend/data-stores/psql/__tests__/schema-content-provenance.test.mts)
checks every table's columns, validated constraints, valid index and trigger, the trigger on a real
`posts` partition row and on rows of the partitioned `conversation_messages` table, the OAuth client label columns, and that no view references either
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
provenance; config-driven seeds, fixtures and scripts pass `system`. A queue job that finishes work
a request submitted passes the provenance that request stored (user RSS feed imports); other queue
jobs pass `system`. Platform-authored
StoryTeller posts and ban-evasion reports always record `system`, even when a request triggered
the work. A revived row preserves its original provenance.

### Unclassified session writes fail closed

A session origin with missing or invalid client information cannot create content. Creation
routes return `400` with `INVALID_CLIENT_INFO`, including while client metadata enforcement is
in observe mode. This prevents an unknown channel from being recorded.

## Exposure

[#706](https://github.com/vouchington/vouchington/issues/706) shows the credential-grade channels
on posts. `resolvePublicProvenanceLabel`
([`backend/services/content-provenance`](../../../backend/services/content-provenance/resolve-public-provenance-label.mts))
is the one place that decides what a viewer sees.

**Public label.** Only `api` and `mcp` rows carry one. The `web`, `swift`, `dotnet` and `system`
channels are telemetry-grade or server-assigned, so they never appear publicly. The app name has
four tiers, and the first that applies wins:

| Tier | Client                                                                    | `app_name`                           |
| ---- | ------------------------------------------------------------------------- | ------------------------------------ |
| 1    | CIMD client whose `metadata_url` is on the reviewed `KNOWN_OAUTH_CLIENTS` | The reviewed display name            |
| 2    | Any other CIMD client                                                     | The `metadata_url` hostname          |
| 3    | Dynamically registered client with staff `verified_at` set                | Its `client_name`                    |
| 4    | Anything else, including a row with no OAuth client                       | `null`: plain "via API" or "via MCP" |

The allowlist lives in
[`known-clients.mts`](../../../backend/services/oauth-authorization-server/known-clients.mts), and
stays empty until a name and its document URL are reviewed together. A client's own claimed name
is never shown unless staff verified it.

**Shape.** A post carries optional `provenance: { via: 'api' | 'mcp', app_name: string | null }`.
The server returns structured data, not English: each client composes "via API", "via MCP" or
"via {app}" from its own localized copy.

**Staff view.** Administrators and moderators also get optional `staff_provenance`, with the
`created_via` of every channel and the raw `oauth_client` (`client_id`, `client_name`,
`metadata_url`, `verified`). No other viewer, including the author, receives it. MCP carries the
public label only.

**Anonymous posts.** A named app can identify its owner, so an anonymous post shows `app_name:
null` to any viewer who cannot see the author: everyone except the author and administrators. The
channel itself stays visible. For moderators, `staff_provenance` keeps `created_via` and omits
`oauth_client`, matching what moderators already cannot learn about an anonymous author.

**Computed per request.** The columns stay out of the cached `Post` and out of `view_posts`.
After the cache read, one batched query joins `posts` to `oauth_clients` and the response gets
copies of the posts with the fields set, so a rename or an unverify shows on the next read. Routes
that mask anonymous authors attach the label before masking, because masking hides the author id
the rule needs.

**Where it appears.** Every route that reads posts for display: post detail, the posts list,
comment ancestors and descendants, community posts and news, feed posts and RSS feed items,
trending posts, topic recommendations, list items, user collections and story related posts, plus
the MCP `get_post`, `get_post_ancestors`, `get_post_descendants`, `get_community_posts` and
`get_community_pinned_posts`. Lean result summaries that carry no post entity (`search_posts`,
`get_trending_posts`) and omnisearch have nothing to attach it to. The author's own `POST` and
`PATCH` post responses, and the MCP `create_post` and `update_post` results, are mutation echoes
rather than read projections, so they carry no label.

**Not yet exposed.** Communities, topics, lists and RSS feeds have the columns but no label yet:
[#2046](https://github.com/vouchington/vouchington/issues/2046). Native client rendering is
[vouchington-clients#206](https://github.com/vouchington/vouchington-clients/issues/206).

The web client renders the label as a badge on post cards and post details, and moderation staff see
the raw channel and client on the same surfaces.

## Delivery scope

[#611](https://github.com/vouchington/vouchington/issues/611) delivers writers, seeds and required
schema together as one current contract. There is no historical untracked-row state or separate
Contract stage. [#706](https://github.com/vouchington/vouchington/issues/706) shipped public "via API"
and "via MCP" labels and staff visibility for posts (see [Exposure](#exposure)); the other content
types follow in [#2046](https://github.com/vouchington/vouchington/issues/2046).

## AI authorship disclosure

AI disclosure belongs to the author: public `account_type='ai_agent'` renders **AI Agent** on each author display. Automated accounts without a live agent render **System**; reserved people and qualifying role-bearing members render **Official**. See [account permissions](../trust-safety/reference-trust-system-official-accounts-and-material-connections.md#official-account-permissions). `created_via='system'` means no request made the write and remains internal; it never renders a provenance channel label.
