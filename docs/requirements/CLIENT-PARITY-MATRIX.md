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

Account-type contract coordination ([vouchington#1834](https://github.com/vouchington/vouchington/issues/1834))
is delivered for web and API: every user projection carries a required nullable `account_type`
(`official`, `system`, `ai_agent` or `null`) with Official, System, and AI Agent labels. Native
parity is not delivered. Decoding `account_type`, rendering the author labels, and hiding vote
controls from every non-null `account_type` are tracked in
[vouchington-clients#205](https://github.com/vouchington/vouchington-clients/issues/205). Until it
lands, Swift cannot decode the signed-in identity fixture, native shows no author label, and native
vote controls still appear for platform accounts.

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

## Copyright statement handoff

The participant case contract now requires `statements`, with immutable email text, delivery kind,
canonical delivery state, and nullable sent time. Failed and bounced delivery must be shown as terminal outcomes rather than pending. Web displays these notices; Swift and .NET must regenerate from the updated
participant fixtures and render only the server-projected participant texts. Staff responses use an
empty array and public member cases have no statement field. Statement text carries absolute site
URLs and a plain UTC date, so a client renders it as given and never prefixes an origin. Native
copyright UI remains deferred to #853 and #854; this producer change does not complete those client
surfaces.

## Copyright claimant attribution handoff

DSA statement-submission replay is administrator-only staff API tooling; it has no web or native consumer.
DSA copyright transparency record/export routes are staff API tooling with no web or native consumer.

Trusted-flagger registry routes are staff API tooling only, with no web registry UI or native consumer.

Vouchington stages the required nullable claimant public-profile contract in the web API fixtures.
Web consumes it now. Swift and .NET consumption remains deferred to #853 and #854; native clients
must not infer a legal identity from the nullable profile. The case timeline is filtered by the
server per audience (members and case participants: case-facing events only; staff unfiltered), so
a native client renders only the event types it receives and must not treat an unrecognized type
as display-safe. Staff guest-capability management (issue, list, revoke, and information requests)
is web-only staff tooling; its fixtures, including `web.copyright.guest-capabilities.listed`, have
only the web consumer. The staff case's emailed information-request delivery state (queued, sent,
failed, or bounced) comes from `delivery_intents` entries whose `delivery_kind` is
`staff_information_request`; it is web-only too, and no native client renders it. The staff case
also carries `claimant.misuse`, the claimant account's misuse ledger counts (or null when no account
filed the notice); it is web-only staff tooling with no native consumer. Staff email-intake review is web-only staff tooling too. Its rejection and
information-request responses (`web.copyright.email-intake-rejection.reply-queued` and `.no-reply`,
`web.copyright.email-intake-information-request.reply-queued` and `.no-reply`) have only the web
consumer; native clients have no staff email review action, including the
`copyright_email_intake.ses_verdicts` verdicts, the `copyright_email_intake.parser_error` text and
parsed-email or recommendation empty states, and the null `raw_email.download_url` that quarantines
an email SES flagged for malware. Its **Record as legal process** action
(`POST /api/v1/copyright-email-intakes/:id/legal-process`, response `{ decision: 'legal_process' }`)
is web-only staff tooling as well: it has no fixture and no native consumer, and it sends no reply.
The queue fixture (`web.copyright.email-intake-queue.default`)
also carries `waiting_reason` and `waiting_since`, which list a declined intake whose reply failed
or bounced; only the web consumer reads them. The staydown queue reason
(`staydown_review`, the "Possible re-upload" status) and its `staydown_matches` list in the staff
queue fixture `web.copyright.staff-queue.default`, plus the mark-reviewed action, are web-only
staff tooling as well; native clients have no staff copyright queue. The territorial staff queue reasons `territorial_notice_review` and
`territorial_decision_reopened`, plus the `territorial` case projection, are web-only staff
contracts; there is no native staff client consumer. The #1906 staff territorial screen provides the decision picker, complaint decisions, and EU Art. 21
referral, outcome, and implementation controls before approval. It uses the post-image target contract
and two-stage decision/reopening flow; no native staff consumer exists. The
[request and response contract](api/v1/copyright-notices/README.md) is owned by the API page.
EU filing and complaint UI is web-only. The EU form supports guests behind the jurisdiction
availability read; signed-in notifier and poster case pages show their own immutable statements,
complaint windows and requests, reopening state, and dispute settlements. Availability errors hide
new filing; existing case and complaint pages remain usable after withdrawal. Guest notifiers
complain by admitted email reply. `territorial_redress_review`, notifier receipt details, live
recipient informed times, complaint decisions, and Art. 21 records are part of the staff territorial
projection. Swift and .NET have no EU filing or complaint surface; the capability
`copyright-eu-notices` is tracked in #1229. UK public filing and participant UI remain out of scope,
and UK redress has no participant route: `POST /api/v1/copyright-uk-notices/:id/redress-requests` is
staff-only, so staff record a UK complaint received by another channel.

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
consumer. The native manifest and catalog no longer carry the `native.credentials.adminAudience`
and `native.credentials.audience` claims. A native client that still offers an administrator
API-key audience drops that choice the next time it reworks the picker; Vouchington does not wait
on it.

The API-key storage column is `scopes` and uses the same generated enum as OAuth grants. API v1
continues accepting and returning `permissions` as catalogue scope strings; client DTOs and pickers
retain that wire field. The SQL read projection resolves the public field explicitly.

The `copyright-notices:read` admin MCP grant exposes structured email intakes, guest-capability
lists, participant case detail, and the existing review queue with contact redaction. Those tools
are exclusive to the OAuth-only admin MCP; they do not add a native client surface. Copyright
decision tools use the separate exact OAuth `copyright-notices:write` grant, which requires
`copyright-notices:read`, and the default-off `copyright.mcpDecisionTools` switch. Umbrella grants
cover neither copyright grant. These 17 staff tools remain admin MCP only: they introduce no
native tool-manifest capability or native staff screen. Consent and credential pickers use the
generated scope catalog and retain explicit selection for exact grants. Email approval takes the
same caller-stated notice form as the staff REST route, with the recommendation as guidance only;
admission uses server-owned recommendation fields rather than caller contact details; replies are
fixed.
The [admin API contract](api/v1/admin/README.md#mcp-clients) owns tool scope and exclusions, and
the [runbook](../runbooks/copyright-notices.md#copyright-mcp-decision-tools) owns developer-only
REST enablement and MCP disablement.

### Client ID Metadata Document boundary

Native OAuth coordinators open the hosted browser flow rather than render consent copy. Client ID
Metadata Document consent name and hostname changes therefore remain in that hosted browser
surface and do not change native REST DTOs or fixture consumers. A discovered native DTO or
consumer change requires the normal linked client validation PR.

### Community, report, dispute and appeal MCP tool handoff

Eleven user MCP tools write or read community membership, content reports, review disputes and
moderation appeals for the credential owner (see
[Community, Report, Dispute and Appeal Tools](../overview/architecture/agent-tools/community-report-appeal-write-tools.md)).
They are MCP-only: none carries the `client` surface or enters `backend/tools/manifest.json`, REST
routes, DTOs and fixtures do not change, and web and native clients gain no screen. The new
`communities:write`, `disputes:read/write`, `appeals:read/write` and `reports:write` scopes arrive
through the generated scope catalogue, so the web and native credential pickers, which filter that
catalogue and resolve its description keys through their localisation catalogues, list them without
a client change. Each tool's own-case reads are narrower than the member REST list, and account
suspension appeals remain a web flow. No `vouchington-clients` work follows.

## Member-chat transcript handoff

#228 publishes one conversation/message DTO contract with ordered message IDs for duplicate-safe
submission and explicit completion status. Shared `api-fixtures/v1/responses/native.chat.*.json`
examples cover completion, retry, duplicate, authorization, pagination and incomplete history. Swift,
Android and .NET adopt these independently under clients#149 and clients#150; the removed web chat
surface does not gain a new rendered UI claim.

### Hosted chat transport removal

A6a (#1542) removes the hosted SSE `POST /api/v1/conversations/:conversationId/chat` route, so it
now returns 404, along with its `chat` and `reconcile-chat-runtime-generations` queue jobs and the
Valkey token channel. The regenerated `api-fixtures/v1/request-contracts.json` drops the operation and its unavailable-route entry. Native
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

## Provenance label handoff

#706 and #2046 expose how a post, community, topic, list or RSS feed was written. `Post`,
`Community`, `Topic`, `List` and `ViewRssFeed` responses carry `provenance` (`{ "via": "api" | "mcp",
"app": App | null }`) for rows created through the API or MCP, and nothing for web, Swift, .NET or
system rows. `app` is facts, never wording: `{ "kind": "known", "key" }` for an allowlisted Client ID
Metadata Document client (a lowercase slug), `{ "kind": "hostname", "hostname" }` for any other such
client, `{ "kind": "verified", "client_id", "client_name" }` for a staff-verified dynamically
registered client, or `null` for everyone else. Clients compose the wording from their own copy:
"via {client_name}" and "via {hostname}", "via API" or "via MCP" for `null`, and for `known` the
display name looked up by `key` in the client catalog, falling back to the plain "via API" or "via
MCP" label when the key has no copy, never the raw key. The field is computed on each read, so a
rename or an unverify shows on the next request. A post marked anonymous sends `app: null` to every
viewer who cannot see its author. Administrators and moderators also receive `staff_provenance`
(`created_via` and, when the post came through an OAuth client, `oauth_client` with `client_id`,
`client_name`, `metadata_url` and `verified`); the client is omitted for anonymous posts they
cannot attribute. The REST read routes and the MCP `get_post`, `get_post_ancestors`,
`get_post_descendants`, `get_community_posts` and `get_community_pinned_posts` tools carry the
public label, and so do the post in the `POST /api/v1/posts`,
`POST /api/v1/communities/:idOrSlug/posts` and `PATCH /api/v1/posts/:idOrSlug` responses and in the
MCP `create_post` and `update_post` results. MCP never carries `staff_provenance`.

Communities, topics, lists and RSS feeds carry the same two fields. Every full entity object a
response serializes is labeled: the primary payloads and the `topics`, `rss_feeds`, `communities`
and `lists` sidecar maps, on the list, detail, create and update routes, the trending and
recommended routes, the hostname and fediverse routes and the user collections. Slim records, such
as the community on a post, trending communities and global search results, and entities nested in
another entity, such as the `topic` of a `ViewRssFeed`, carry neither field. Creating an RSS feed
returns ids and a slug, so it carries neither. The MCP `get_community`, `search_communities`,
`get_list`, `get_my_lists`, `create_list`, `update_list`, `get_topic_details`, `get_rss_feed` and
`search_rss_feeds` tools carry the public label and never the staff block.

Swift and .NET must decode both optional fields on all five entities and render the badge beside
the post type badge on posts and on the cards and detail headers of communities, topics, lists and
RSS feeds, composing the text from their own localized copy. The structured shape of posts is staged in `api-fixtures/v1/` as `native.users.profile.posts.provenance` and
`native.users.profile.posts.staff-provenance`. Native delivery is tracked by
[vouchington-clients#206](https://github.com/vouchington/vouchington-clients/issues/206); this
repository does not edit `vouchington-clients`, and native delivery never blocks the entity routes.

## Retired agent flag action handoff

#188 removes the last per-agent flag action. The seeded moderators are record-only, so
`moderator_agents.on_flag_action` and the `moderator_on_flag_action` enum are gone, and the
`community_ai_agent` and `community_ai_agents` responses (`/api/v1/communities/:idOrSlug/ai-agents`)
no longer carry `on_flag_action`. Web drops the action text from each agent row. The same change
removes `reason` from the automod simulate results and from the prompt `test-runs` response, which
now returns `{ "flagged": boolean }`: the classifier answers with a probability, so the field was
always empty. Swift `CommunityAdministrationModels.swift` declares `onFlagAction` as a non-optional
Codable property, so **current Swift builds fail to decode `community_ai_agent` until the clients
follow**. .NET `ApiModels.CommunityAgents.cs` and the row display in
`CommunityDetailViewModel.Surface.Rows.cs` (line 55) read the same field. The stale prompt-model
declarations in Swift `CommunityAgentPromptModels.swift` and .NET `ApiModels.Communities.Moderation.cs`
also still mention it. Vouchington has not launched, so this ships as one current contract with no
shim. Native delivery is tracked by
[vouchington-clients#201](https://github.com/vouchington/vouchington-clients/issues/201); this
repository does not edit `vouchington-clients`.

## Classifier moderation reason handoff

#1814 removes the last classifier `reason`. The community prompt classifier answers with a
probability, so `agent_moderations.results` no longer carries `reason`: the `AgentModerationResults`
object in `GET /api/v1/communities/:communitySlug/posts/:postId/moderation-results` and in the
admin moderation data on `GET /api/v1/posts` now requires only `flagged`. The community automod
recent-actions response (`GET /api/v1/communities/:communitySlug/automod/recent-actions`) drops
`automod_actions[].reason`, and `POST /api/v1/communities/:idOrSlug/agent-prompts/:promptId/test-runs`
no longer accepts `expected_reason`; its body is a closed object, so a request that still sends the
field gets 422. Web drops the reason line from the admin moderation dialog and the reason badge from
the automod review row. The AI-generated detector keeps its own `reason`, stored in
`post_classifier_local_outcomes`, which is not part of this contract.

Native state, read from `vouchington-clients` at `afcc3af`: no decoder reads
`AgentModerationResults`, so the moderation-results change needs nothing. Swift
`CommunityAutomodAction.reason` (`CommunityAgentPromptModels.swift`) is optional and decodes a
missing key as `nil`; .NET `CommunityAutomodAction.Reason` (`ApiModels.Communities.Admin.cs`) is
nullable and the serializer does not require constructor parameters. Both clients already fall back
to the post type or the confidence score, because the server wrote an empty string that the query
returned as `null`, so nothing renders differently. `expected_reason` stays as an optional
parameter on Swift `Endpoint+CommunityAgents.swift` and .NET `ApiRequest.Communities.Actions.cs`
(`CommunityAgentPromptTestRunRequest`); both omit it when unset and no production call site sets it,
so current builds keep working, but any caller that sets it now fails with 422. The clients should
delete the dead fields and parameter and the tests that pin them. Vouchington has not launched, so
this ships as one current contract with no shim. The change fits the scope of
[vouchington-clients#201](https://github.com/vouchington/vouchington-clients/issues/201), which
already lists the simulate and test-run `reason` removal; this repository does not edit
`vouchington-clients`.

## Semantic post search candidate window

#1549 keeps REST post search and MCP `search_posts` on the same approximate, capped candidate
window. Existing response fields and opaque cursors stay the same; pagination ends at the window,
and facets count only its candidates. Web, Swift and .NET can continue using `has_next_page` and
the server cursor without decoder changes. Hybrid results can omit matches outside the window;
clients must not describe these search results or counts as exhaustive. Similar-item searches
retain their current behavior.

## Classifier threshold management handoff

#224 adds staff-only endpoints under `/api/v1/admin/classifiers` to list classifiers and their
candidates, set, clear and roll back a candidate's threshold override, and read an aggregate
comparison of classifier probabilities against human votes. They are administrator and site
moderator tools with no user-facing surface, so there is no native consumer and no native work:
the `engineering.admin.classifiers.*` fixtures declare `consumers: []`, and the web client keeps
only a static manifest entry. The repository does not yet have a web admin page for them; the
endpoints are reachable by API and a web admin page is future work. Staff mutation
controls stay web-only, as in the staff action history handoff below.

## Queue delayed count handoff

`GET /api/v1/mq/queues` rows gain `delayed` and `GET /api/v1/mq/stats` (and the `/api/v1/mq/stream`
`stats` event) gains `totalDelayed`: GlideMQ's scheduled set, which holds unpromoted priority jobs,
future delays and backoff retries that `waiting` excludes. Web reads only `paused` from these
responses, so it needs no change. Swift `EngineeringQueueStats` and the five-key
`EngineeringAggregatedQueueStats.encode(to:)`, and .NET `QueueStats` and `QueueStatsSummary`, must
add the fields before the staged `web.admin.mq.stats.default` and `web.admin.mq.queues.default`
fixtures reach them, or their fixture-coverage tests report dropped fields. The native Engineering
queues pages render waiting, active, completed and failed counts, so they should render delayed
beside waiting. Vouchington has not launched, so this ships as one current contract with no shim.
Native delivery is tracked by
[vouchington-clients#202](https://github.com/vouchington/vouchington-clients/issues/202); this
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

Admin MCP tools (#209): the admin server remains OAuth-only. Ordinary moderation, account enforcement, and site-operation reads can use matching admin umbrella grants; destructive approval, AI rerun, agent votes, account sanctions, operational writes, copyright, analytics, and editorial scopes require explicit grants and appear in hosted sensitive consent. Tools remain exclusive to `admin_mcp` and do not enter the native client tool manifest. The vote-ring penalty REST contract now requires `{ flag, penalized_user_count }`; web consumes that flag directly. Swift and .NET must regenerate their shared contracts and apply the returned flag before release; [clients #200](https://github.com/vouchington/vouchington-clients/issues/200) owns this pending parity work. The client implementation is prepared locally, with canonical staging and native toolchain/publication checks still blocked. Copyright MCP decisions additionally require the exact write grant and default-off switch described above; their required rationale uses the existing encrypted per-call audit, including path-only operations, without adding a rationale read API or changing append-only retention. MCP decisions skip training feedback until an independent staff/user action supplies evidence through the existing workflow.

## Manual crawl fanout count

For `POST /api/v1/urls/:id/crawl`, `enqueued_count` counts jobs actually queued by the initial
bounded page. Referral-link fanout resumes the remaining links in a URL-scoped background
continuation. Web, Swift, and .NET must treat this count as dispatch progress rather than the total
eligible fanout or completed crawl work; the response shape remains unchanged. See the
[URLs API](api/v1/urls/README.md#post-apiv1urlsidcrawl).

## Runtime pagination limits

`pagination-config` tunes page sizes within unchanged request-contract ceilings; lowered maxima
may return shorter pages. All consumers continue from `page_info.end_cursor` when `has_next_page`
is true. Requested size and the static default do not promise a full page; response shapes and
cursors remain unchanged.

The [pagination contract](../overview/architecture/pagination.md#runtime-page-limits) defines
profile ownership and default clamping. This records API behavior coordination and does not
change rendered native parity claims.

## Retained community prompt creator handoff

The pre-launch schema review (#1597) retains community prompts when their creator is deleted.
The shared prompt contract therefore makes `created_by_id` nullable. Web prompt management does not
render or authorize from that field; the server requires a live creator's membership before an
active prompt can run. Swift and .NET must regenerate from this nullable shared contract when it
lands. Their native build and fixture validation remain unverified in this schema-only stack.
Moderation appeal original-decision fields keep the same wire shape; the generated schema now
names their existing object type.

## Pre-launch column contract handoff (#1592)

Vouchington and web adopt the following current API field names together. Regenerated shared
request/response fixtures and MCP contracts describe this handoff. Swift and .NET must
regenerate their models and update callers before using these fields; their native builds and
fixture validation are unverified in this schema stack. External provider payloads retain their
protocol names.

| Resource                                              | Current API fields                                                                                                                                                                                                                  | Web adoption / Swift and .NET handoff                          |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Posts and comment trees                               | `parent_post_id`, `root_post_id`, `outbound_activitypub_like_activity_id`                                                                                                                                                           | Web callers and fixtures updated; native regeneration pending. |
| Communities                                           | `should_allow_review_posts`, `should_allow_data_point_posts`                                                                                                                                                                        | Web callers and fixtures updated; native regeneration pending. |
| Community application questions                       | `is_required`                                                                                                                                                                                                                       | Web callers and fixtures updated; native regeneration pending. |
| Community members                                     | `should_suppress_community_digests_while_on_vacation`                                                                                                                                                                               | Web callers and fixtures updated; native regeneration pending. |
| Community prompts                                     | `is_slot_allocated`                                                                                                                                                                                                                 | Web callers and fixtures updated; native regeneration pending. |
| Community invites                                     | `accepted_by_id`                                                                                                                                                                                                                    | Web callers and fixtures updated; native regeneration pending. |
| Community moderation and moderator actions            | `actor_user_id`, `hostname_crawler_configuration_id`, `operation_request_action_id`                                                                                                                                                 | Web callers and fixtures updated; native regeneration pending. |
| Moderation appeals                                    | `appellant_user_id`                                                                                                                                                                                                                 | Web callers and fixtures updated; native regeneration pending. |
| Moderation media reveals                              | `moderator_user_id`                                                                                                                                                                                                                 | Web callers and fixtures updated; native regeneration pending. |
| Agent moderations                                     | `is_flagged` (provider result JSON retains `flagged`)                                                                                                                                                                               | Web callers and fixtures updated; native regeneration pending. |
| Conversations                                         | `assigned_moderator_user_id`                                                                                                                                                                                                        | Web callers and fixtures updated; native regeneration pending. |
| Households                                            | `owner_user_id`                                                                                                                                                                                                                     | Web callers and fixtures updated; native regeneration pending. |
| Memberships                                           | `should_cancel_at_period_end`                                                                                                                                                                                                       | Web callers and fixtures updated; native regeneration pending. |
| Membership source states and observations             | `should_auto_renew`, `membership_provider_evidence_record_id`                                                                                                                                                                       | Web callers and fixtures updated; native regeneration pending. |
| Membership refunds and administrator requests         | `has_revoked_access`, `is_cancel_requested`                                                                                                                                                                                         | Web callers and fixtures updated; native regeneration pending. |
| Users and account preferences                         | `referrer_user_id`, `should_import_hacker_news_discussions`, `should_receive_third_party_marketing`, `is_engagement_emails_enabled`, `is_moderation_emails_enabled`, `is_fediverse_federation_enabled`, `is_verified_badge_visible` | Web callers and fixtures updated; native regeneration pending. |
| Hostnames and embedded URL hostnames                  | `is_blocked`, `is_crawlable`, `is_emailable`, `should_follow_link_rel`, `should_ignore_robots_txt`, `should_skip_web_risk`                                                                                                          | Web callers and fixtures updated; native regeneration pending. |
| RSS feeds and settings                                | `should_ignore_robots_txt`, `is_enabled`                                                                                                                                                                                            | Web callers and fixtures updated; native regeneration pending. |
| RSS import batches                                    | `should_follow_imported_feeds`                                                                                                                                                                                                      | Web callers and fixtures updated; native regeneration pending. |
| Topics                                                | `is_noindexed`, `should_allow_reviews`                                                                                                                                                                                              | Web callers and fixtures updated; native regeneration pending. |
| Cards and card topics                                 | `card_topic_id`, `authorized_user_of_card_id`, `bank_topic_id`, `brand_topic_id`                                                                                                                                                    | Web callers and fixtures updated; native regeneration pending. |
| Referral and rewards program topics                   | `company_topic_id`                                                                                                                                                                                                                  | Web callers and fixtures updated; native regeneration pending. |
| Rewards program statuses                              | `started_on`, `expires_on`                                                                                                                                                                                                          | Web callers and fixtures updated; native regeneration pending. |
| Landing page items and groups                         | `review_post_id`                                                                                                                                                                                                                    | Web callers and fixtures updated; native regeneration pending. |
| Fediverse instances                                   | `is_open_for_registrations`                                                                                                                                                                                                         | Web callers and fixtures updated; native regeneration pending. |
| Copyright form intakes and reviews                    | `has_good_faith_belief`, `has_accuracy_authority_under_penalty_of_perjury`, `is_accepted`                                                                                                                                           | Web callers and fixtures updated; native regeneration pending. |
| Copyright assessments and repeat-infringer incidents  | `is_substantially_compliant`, `is_from_original_claimant`, `is_same_material`, `is_operative`                                                                                                                                       | Web callers and fixtures updated; native regeneration pending. |
| Copyright submissions, redress, and dispute referrals | `submitted_by_id`, `referred_by_id`                                                                                                                                                                                                 | Web callers and fixtures updated; native regeneration pending. |
| Copyright territorial receipts and lifecycle changes  | `has_good_faith_statement`, `is_counter_notice_accepted`                                                                                                                                                                            | Web callers and fixtures updated; native regeneration pending. |
| Copyright trusted flaggers                            | `awarded_on`                                                                                                                                                                                                                        | Web callers and fixtures updated; native regeneration pending. |
| Copyright correspondence reviews                      | `copyright_notice_correspondence_message_id`                                                                                                                                                                                        | Web callers and fixtures updated; native regeneration pending. |
| Notifications and feed shares                         | `sent_by_id`, `shared_by_id`                                                                                                                                                                                                        | Web callers and fixtures updated; native regeneration pending. |
| Image placement activations and moderation            | `is_bound_by_administrator`, `bound_by_id`, `uploaded_by_id`, `is_flagged_by_openai_omni_moderation`                                                                                                                                | Web callers and fixtures updated; native regeneration pending. |
| Report integrity                                      | `new_account_reporter_percent`                                                                                                                                                                                                      | Web callers and fixtures updated; native regeneration pending. |
| Crawls                                                | `language`, `hostname_crawler_configuration_id`                                                                                                                                                                                     | Web callers and fixtures updated; native regeneration pending. |
| Passkeys                                              | `is_backed_up`                                                                                                                                                                                                                      | Web callers and fixtures updated; native regeneration pending. |
