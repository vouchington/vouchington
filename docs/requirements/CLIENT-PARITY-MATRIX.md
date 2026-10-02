# Client Parity Matrix

This document summarizes **rendered, functional UI parity** across web, Swift, and .NET. The
machine-readable source of truth is
[client-feature-parity.json](./client-feature-parity.json); every summary row below maps to one or
more capability records in that contract.

A route, endpoint, response type, or navigation catalog entry is not UI evidence. A rendered native
status requires a real presentation path, and every native `full` claim requires an executable
behavioral test or an explicitly declared source-audit test. A source audit verifies UI wiring when
framework-owned code cannot execute directly; it is not behavioral evidence. The native evidence
paths in `client-feature-parity.json` are relative to
[`vouchington/vouchington-clients`](https://github.com/vouchington/vouchington-clients), while web
paths remain relative to Vouchington. The client repository validates those native paths and consumes
the staged Vouchington fixture contract; Vouchington retains the matrix and checks navigation/table
coverage rather than asserting that an external checkout has tracked files. Both repositories keep
active Table C issues synchronized so a full summary row cannot hide a lower-level native mismatch.

Historical `[#N]` identifiers in the matrix are archival provenance from the predecessor tracker.
They deliberately remain plain text: the identifiers retain their evidence context without exposing
or implying a public destination for predecessor issues or milestones.

Lifecycle parity is additionally executable through the stable scenario IDs in
[`api-fixtures/v1/lifecycle-scenarios.json`](../../api-fixtures/v1/lifecycle-scenarios.json). The
[fixture authoring guide](../development/testing/backend/api-fixtures.md#lifecycle-scenario-contract)
defines the required claim and adapter workflow. Moderation operations, integrity actions, and
saved/bookmark capabilities cite platform runners that consume that shared contract.

See also:

- [Native Client Strategy](../overview/architecture/native-clients.md)
- [Client Intent Parity](./navigation/CLIENT-INTENT-PARITY.md)
- [Native Parity Interactions](../checklists/native-parity-interactions.md)
- [Entity × Action Matrix](./ENTITY-ACTION-MATRIX.md)
- [Entity × Lifecycle Flow Matrix](./ENTITY-LIFECYCLE-MATRIX.md)
- [User profiles and friend recommendations](./users/USERS.md)
- [User settings and financial workflows](./users/USER_SETTINGS.md)
- [Notification behavior and preferences](./navigation/NOTIFICATIONS.md)
- [Localization](./users/LOCALIZATION.md)
- [Bookmarks Catalog](./content/BOOKMARKS-CATALOG.md)

## Contents

- <a id="legend"></a>[Legend](reference-client-parity-matrix-legend.md)
- <a id="table-a--cross-cutting-capabilities"></a>[Table A — Cross-Cutting Capabilities](reference-client-parity-matrix-table-a-cross-cutting-capabilities.md)
- <a id="table-b--domain-surfaces"></a>[Table B — Domain Surfaces](reference-client-parity-matrix-table-b-domain-surfaces.md)
- <a id="table-c--active-gaps-and-synchronization-rule"></a>[Table C — Active Gaps and Synchronization rule](reference-client-parity-matrix-table-c-active-gaps.md)

## Bounded story article handoff

Vouchington stages `story_member_pages` in feed, search, and community responses and the
`native.stories.get.default` / `native.stories.get.after` shared fixtures before the linked
`vouchington/vouchington-clients` PR consumes them. A preview contains related members only. Web,
Swift, and .NET keep the first direct primary and its opaque cursor when a story repeats on a later
feed page; shared deliveries stay standalone. Expansion renders the prefetched articles without a
request, and explicit continuation appends up to 25 articles with the original primary excluded.
Loaded rows, media, and actions stay present during loading or retry. The linked native
[draft PR #183](https://github.com/vouchington/vouchington-clients/pull/183)
remains draft until this producer contract reaches `main`, then its staged fixture and localization
checks pass. Existing producer/client localization cleanup tracked by Vouchington
#854 and
[vouchington-clients#166](https://github.com/vouchington/vouchington-clients/issues/166) currently
blocks the native exporter independently of these story fixtures.

## Push generation handoff

Vouchington owns the API fixture and generated web client contract for push subscription generations.
Browser clients that own a worker push binding send its exact endpoint and subscription ID on
logout, and treat a worker binding mismatch as disabled. Native clients do not own that browser
state and continue using the supported no-body logout request. Deploy the server migration and
generated contract before releasing a client that adopts the optional logout binding.

## Copyright claimant attribution handoff

Vouchington stages the required nullable claimant public-profile contract in the web API fixtures.
Web consumes it now. Swift and .NET consumption remains deferred to #853 and #854; native clients
must not infer a legal identity from the nullable profile. The case timeline is filtered by the
server per audience (members and case participants: case-facing events only; staff unfiltered), so
a native client renders only the event types it receives and must not treat an unrecognized type
as display-safe. Staff guest-capability management (issue, list, revoke, and information requests)
is web-only staff tooling; its fixtures, including `web.copyright.guest-capabilities.listed`, have
only the web consumer. The staff case's emailed information-request delivery state (queued, sent,
failed, or bounced) comes from `delivery_intents` entries whose `delivery_kind` is
`staff_information_request`; it is web-only too, and no native client renders it. Staff email-intake review is web-only staff tooling too. Its rejection and
information-request responses (`web.copyright.email-intake-rejection.reply-queued` and `.no-reply`,
`web.copyright.email-intake-information-request.reply-queued` and `.no-reply`) have only the web
consumer; native clients have no staff email review action, including the
`copyright_email_intake.ses_verdicts` verdicts and the null `raw_email.download_url` that quarantines
an email SES flagged for malware. Its **Record as legal process** action
(`POST /api/v1/copyright-email-intakes/:id/legal-process`, response `{ decision: 'legal_process' }`)
is web-only staff tooling as well: it has no fixture and no native consumer, and it sends no reply.
The queue fixture (`web.copyright.email-intake-queue.default`)
also carries `waiting_reason` and `waiting_since`, which list a declined intake whose reply failed
or bounced; only the web consumer reads them. The
[request and response contract](api/v1/copyright-notices/README.md) is owned by the API page.
Table B lists every web copyright surface (policy pages, member cases, notice filing, poster
responses, guest filing, and the four staff surfaces). Swift and .NET render none of them, and
Table C tracks each `copyright-*` capability as a native gap.

### Agent tool manifest handoff

`backend/tools/manifest.json` no longer lists `get_topic_hierarchy`: `get_topic_details` returns
parents and one bounded page of children through its optional `hierarchy`, `children_after` and
`children_limit` arguments. `search_posts`, `search_topics`, `get_trending_posts` and
`get_trending_topics` keep their names and gain optional `after` and `limit` arguments plus
`page_info` in their results. The absorbed `search_posts_semantic`, `search_topics_semantic` and
`search_topics_text` were MCP-only and never in the manifest. A `vouchington-clients` follow-up
regenerates its copy of the manifest and drops any dispatch of `get_topic_hierarchy`.

The paged search arguments are a deliberate breaking change with no compatibility path, accepted by
the plan owner because native clients do not call these tools. `search_posts` no longer accepts
`sort: 'ranking'`, which had no effect; its sorts are `new`, `best`, `hot`, `relevance` and
`following_new`. `limit` on both search tools is now an integer of at least 1 (values over 100 are
clamped to 100). The default rose from 5 to 25 for `search_posts` and from 10 to 25 for
`search_topics`. A malformed or foreign `after` cursor returns
`{ success: false, error: "Invalid cursor" }` instead of throwing.

`search_posts` now applies the MCP post read policy on every surface, so its author no longer sees
their own private, audience-limited or unapproved posts, and a `similar_post_id` seed that
`get_post` refuses returns an empty page. The arguments and result shape do not change, and native
clients do not call this tool, so no client work follows.

### Media placement contract handoff

`api-fixtures/v1` now stages immutable image placement tuples for every persisted public image
surface: user avatars, topic logos and heroes, community profile and banner images, and profile-link
images. The tuple is `{ placement_id, placement_revision, image_id }`; clients must build public
image routes only from that tuple and must not reconstruct a generic route from `image_id`.
The tuple is absent while delivery projection is pending or withheld, so clients render no persisted
image in that state. The linked `vouchington/vouchington-clients` change must consume the generated
fixtures and update its DTOs and renderers before native release; it must not treat `image_id` as a
browser-delivery capability.

### API-key and connected-app contract handoff

Vouchington stages the scope-catalogue, API-key creation and OAuth-grant fixtures before native
consumers adopt them. The catalogue is authoritative for credential surface, audience,
prerequisite and description-key behavior. Swift and .NET filter it rather than copying scopes,
preserve explicit selection for exact-grant permissions, and resolve description keys through
their localization catalogues. Their connected-app surfaces paginate active grants, distinguish
consent from nullable last use, and retain truthful state when revocation fails. Developer-owned
OAuth app management and administrator verification remain web-only. Native delivery is tracked by
[vouchington-clients#177](https://github.com/vouchington/vouchington-clients/issues/177).

Administrator MCP access is OAuth-only: `mcp.admin:*` scopes accept only the `oauth` surface and
`POST /api/v1/my/api-keys` rejects them for every owner. API-key pickers therefore drop the
administrator audience choice, which the `api-key` surface filter already does for a catalogue
consumer. Native clients that still offer an administrator API-key audience must remove it; the
`native.credentials.adminAudience` and `native.credentials.audience` claims stay in the manifest
until the linked native change lands.

### Client ID Metadata Document boundary

Native OAuth coordinators open the hosted browser flow rather than render consent copy. Client ID
Metadata Document consent name and hostname changes therefore remain in that hosted browser
surface and do not change native REST DTOs or fixture consumers. A discovered native DTO or
consumer change requires the normal linked client validation PR.

## Member-chat transcript handoff

#228 publishes one conversation/message DTO contract with ordered message IDs for duplicate-safe
submission and explicit completion status. Shared `api-fixtures/v1/responses/native.chat.*.json`
examples cover completion, retry, duplicate, authorization, pagination and incomplete history. Swift,
Android and .NET adopt these independently under clients#149 and clients#150; the removed web chat
surface does not gain a new rendered UI claim.

### Hosted chat transport removal

A6a (#1542) removes the hosted SSE `POST /api/v1/conversations/:conversationId/chat` route, so it
now returns 404, along with its `chat` and `reconcile-chat-runtime-generations` queue jobs and the
Valkey token channel. The regenerated `api-fixtures/v1/openapi.json` and
`api-fixtures/v1/request-contracts.json` drop the operation and its unavailable-route entry. Native
clients persist completed turns through `client-generated-chat` with a local provider and do not use
a hosted fallback; that endpoint still rejects hosted providers with 400. Under decision D1 the
server change does not wait on client migrations, so a native build that still calls the hosted
route must delete that path in its own client PR. This repository does not edit
`vouchington-clients`; track any such removal there alongside clients#149 and clients#150.

A6 (#185) drops the agentic-run storage. No response shape changes: `client-generated-chat` never
exposed run or active-turn state. The 409 for a message-identity conflict stays and now also covers
a retry that changes `model_provider` or `model_name`, because the completion model is persisted on
the assistant message. The earlier 409 for a conversation that held an active hosted turn is gone
with the guard; a new turn is accepted beside an incomplete assistant placeholder. Native clients
need no change, but must not rely on a model switch under reused message IDs: generate fresh IDs.

## Orphan tool removal handoff

#1566 removes `search_wikipedia` and `get_wikipedia_summary` from the generated native tool
manifest and MCP catalog, and removes `wikipedia:read` from the shared scope catalog. The fixture
and manifest shapes are unchanged. The native client source audit found no hardcoded calls or
scope consumers to migrate; clients consume the reduced generated catalog. Topic Wikipedia IDs
and URLs remain content fields and are unaffected. Hosted research/discovery package deletion
remains owned by #1546; this change only removes their references to retired tools.

## Community automod action handoff

#221 moves community prompt moderation onto the shared classifier-run lifecycle and replaces the
per-prompt `on_flag_action` with one community setting, `communities.automod_action`
(`record_only` by default, `review_queue` or `unpublish`). `Community` responses carry
`automod_action`, owners and moderators set it with
`PATCH /api/v1/communities/:idOrSlug/automod-settings`, and the web moderation page renders the
control. `community_agent_prompts` no longer has `on_flag_action`, so the prompt responses drop that
field, and the automod simulate response drops `would_unpublish` and `would_unpublish_count` in
favor of `simulation.community_automod_action`. Swift and .NET must decode the new `Community`
field and the reduced prompt and simulate shapes, and render the setting where they render the
automod flag list. Native delivery is tracked by
[vouchington-clients#199](https://github.com/vouchington/vouchington-clients/issues/199); this
repository does not edit `vouchington-clients`.

## Staff action history handoff

Issue #635 extends the shared moderator-action catalog and transcript of staff actions with typed
nullable targets and external-operation request/outcome links. Web consumes the updated generated
contract and localized action labels. Native modlog readers must consume the regenerated contract
and recognize these action types before release; staff mutation controls remain web-only where
specified by the domain matrix. External-operation requests without outcomes must not imply success.

### Appeal metrics and public display names

`AppealMetrics` no longer includes `dismissed`. A denied appeal is counted only in `denied`.
`PublicDisplayAccount` is the display name alone: `{ name }`. OAuth provider identifiers stay on
the private account objects and are not copied into `display_account`. Web already renders appeal
success from `success_rate` and `total_closed`, and display names from `display_account.name`, so
the staff moderation ops row stays full. Swift and .NET drop both decoder fields in
[vouchington-clients#194](https://github.com/vouchington/vouchington-clients/pull/194).

Financial scope consent (#1271): hosted OAuth consent and the web API-key picker describe financial profile and spending exact grants. Native clients have no consent screen; their shared `native.credentials.mcpUserFullAccess` copy now states that financial profile and spending require separate grants. Native presets must explicitly list financial scopes when they intend to access those resources.
