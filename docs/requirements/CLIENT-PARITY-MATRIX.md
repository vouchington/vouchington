# Client Parity Matrix

Rendered, functional UI parity across web, Swift, and .NET is tracked in
[client-feature-parity.json](./client-feature-parity.json). That file is the source of truth and a
cross-repo contract with `vouchington/vouchington-clients`; this page explains how to read it.

- A route, endpoint, response type, or navigation catalog entry is not UI evidence. A rendered
  native status needs a real presentation path.
- Every native `full` claim needs an executable behavioral test, or an explicitly declared
  source-audit test. A source audit verifies UI wiring where framework-owned code cannot execute;
  it is not behavioral evidence.
- Native evidence paths are relative to the clients repository, which validates them. Web paths are
  relative to this repository. This repository does not assert that an external checkout has
  tracked files.
- Active gaps are tracked as issues in both repositories and kept in sync, so a `full` summary
  cannot hide a lower-level native mismatch.
- A new or changed REST route, query parameter, or MCP tool parameter needs a parity decision here
  before it ships. The producer lands first; client work is a dependent issue in the clients
  repository.
- Lifecycle parity is executable through the scenario ids in
  [`api-fixtures/v1/lifecycle-scenarios.json`](../../api-fixtures/v1/lifecycle-scenarios.json).

See also: [Native Client Strategy](../overview/architecture/native-clients.md),
[Client Intent Parity](./navigation/CLIENT-INTENT-PARITY.md), and
[Native Parity Interactions](../checklists/native-parity-interactions.md).

## Post-list continuation

Post search and community post lists page with opaque `page_info` cursors. Clients append the
returned order and stop when `has_next_page` is false. A cursor is valid only for the same sort and
the same `time_range` choice, including the difference between omitting the range and sending
`all`. A cursor from another sort or range is rejected. Swift and .NET continuation and ordering
adoption is tracked in
[vouchington-clients#567](https://github.com/vouchington/vouchington-clients/issues/567), a dependent
follow-up that does not gate the producer change.

## Shared API contract adoption

The moderation-results read returns keyset-paged summaries and platform status. Native views that
show the moderation result count must follow every page before computing that count. This changes
the shared response contract without adding a native UI parity claim. Land the producer change
back-to-back in lockstep with the client adoption PR tracked by
[vouchington-clients#571](https://github.com/vouchington/vouchington-clients/issues/571), never
before the client PR.

| Behavior                                                                        | Web                                           | Swift                                                                         | .NET                                                                          |
| ------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Read every page of community moderation summaries before showing a result count | No runtime consumer; shared contracts updated | Pending [#571](https://github.com/vouchington/vouchington-clients/issues/571) | Pending [#571](https://github.com/vouchington/vouchington-clients/issues/571) |
| Render Turnstile fallback with its operation action and configured web origin   | Full                                          | Pending client adoption                                                       | Pending client adoption                                                       |
| Complete a server-directed bot challenge and retry the pending mutation once    | Full                                          | Pending client adoption                                                       | Pending client adoption                                                       |

The moderation-results read has no matching MCP tool. Browser challenge context is described below.

## Shared image placement capacity

An image may be attached to posts and profile, topic, or community surfaces. If the API rejects a
new attachment with `IMAGE_PLACEMENT_LIMIT_REACHED`, clients should explain that removing another
use of the image frees capacity while preserving existing attachments. Web handles the response
for post creation and updates, profile images, and topic images. Swift and .NET adoption across
their supported image attachment flows is tracked in
[vouchington-clients#559](https://github.com/vouchington/vouchington-clients/issues/559); native
handling remains partial until those flows and their behavioral evidence are complete.

## Profile counts

`GET /api/v1/users/:idOrSlug` returns `user_metrics.count` (reviews, discussions, comments, users
following and followers, topics following, RSS feeds following, and communities joined). Each
number is the exact count up to the profile count cap (1,000 by default, `profile-count-config`).
`user_metrics.count_capped` carries one boolean per count key: `true` means the real total is larger
and the number holds the cap. Clients show a capped count as a compact number with a plus sign (web
shows "1K+") and must not add or compare capped numbers as totals. Web profile tabs and the profile
header render this for the author, a stranger, and an anonymous viewer. Swift and .NET must add
`count_capped` to their response models and fixtures and render capped counts the same way; that
native work is a vouchington-clients follow-up and does not gate this producer change. MCP has no
user-metrics tool, so the change adds no MCP surface.

`topic_metrics.count` uses that same cap for discussions, reviews, data points, news, and latest.
`topic_metrics.count_capped` uses the same boolean-per-key shape. Markdown topic listings print a
trailing plus when a shown count is capped. Swift and .NET render it the same way as profile counts;
that native work does not gate this producer change.

Authenticated topic metrics also expose `viewer_count_capped`, parallel to `viewer_count`.
A true viewer flag means the displayed count is a conservative lower bound. Discussions, reviews,
and data points each have an independently reported flag; each category is flagged when its output
count cap or its inputs reach the shared `viewer_count_input_cap`. Reaching that input cap is
conservative even when the observed count equals the actual total or is zero, so a viewer count
with a true flag can display as `0+`. A false flag means the viewer count is exact. Public
`count_capped` keeps its output-overflow meaning.
Posts, Reviews, and Data Points tab labels retain a plus when either the public count or viewer
count is capped, including when the two numbers are equal or zero ("0+").
Swift and .NET must preserve these flags and the same lower-bound presentation; native adoption
does not gate this producer change. Feed clients must continue through short or empty pages when
`has_next_page` is true, using the supplied opaque cursor. Hot feeds use the same immutable
rank as post search, including future-dated posts. Equal ranks order by post identity, then by
that post's delivery identity, so direct and shared deliveries of one post stay together. Clients
preserve the returned order and treat the continuation as opaque; the cursor's decision instant
anchors the time window. Ranked feeds may return a short page within a narrow time range because
old posts can still qualify through recent shares; clients continue until the continuation flag
is false.

The owner and administrators also get `user_metrics.private_count` (saved, hidden, blocked, muted,
viewed and similar), read to the same cap. `user_metrics.private_count_capped` carries one boolean
per `private_count` key with the same meaning as `count_capped`. The earlier `user_metrics.bookmarks`,
`user_metrics.bookmarkers` and `user_metrics.bookmarks__updated_at` fields are removed: they repeated
`count.topics_following`, `count.users_following`, `count.users_followers` and
`private_count.posts_following`. Swift and .NET drop those fields from their models and fixtures.

## Referral-link reads

REST and the no-topic mode of `get_referral_links` share one list. A `user_id` for someone else
returns that person's active links and the public fields. The signed-in caller's own `user_id`
also returns deactivated links and the private management fields. Administrators use that same
public read for someone else. The same tool keeps prioritized topic reads when a topic is supplied.
Web user pages show the rows as summaries that open the referral program page. Swift and .NET do
not show that tab yet; [clients #585](https://github.com/vouchington/vouchington-clients/issues/585)
tracks it and does not block this change. The clients-owned MCP facts inventory follows the
consolidated catalog under
[clients #398](https://github.com/vouchington/vouchington-clients/issues/398).

The personalized referral-link feed keeps its existing `page_info` contract across REST and MCP.
When its bounded walk returns a short or empty page with `has_next_page: true`, clients continue
with `end_cursor` regardless of the number of visible results. The web feed follows that contract;
the referral-links feature row above covers management UI and makes no native feed-pagination
claim.

## Membership verification outcomes

The billing feature's verification-outcomes row in `client-feature-parity.json` tracks native adoption.
Web, Swift, and .NET omit `next_processing_at` from their response models and fixture expectations,
poll pending verifications with client-side backoff, and accept the `provider_unavailable` reason for
rejected verifications.

REST membership overview and verification reads expose domain outcomes. Queue retry timing is internal;
clients must not infer a retry deadline from a pending verification. The producer contract lands before
the dependent native model and fixture changes. This adds no native UI parity claim.

## Membership history pagination

The administrator membership-history read returns `results` and `page_info`, with an owner-scoped
cursor for older changes. Web, Swift, and .NET have no consumers of this administrative endpoint;
no dependent native work or new UI parity claim is required.

## Stripe purchase collision reviews

The administrator collision-review read returns `results` and `page_info`. Disposition removes the
review; an amount records the reversal case from the lineage's stored price and currency. The same
transaction records a moderator action for the staff actor. The deleted review id and the
disposition code (`dismissed` or `reversal_case_created`) stay in that action's metadata. When a
case is created, its id is the action's foreign key, because the case row remains.
Web,
Swift, and .NET have no consumers of this administrative endpoint, and no staff membership MCP tool
exists for it. The vouchington-clients screen is a follow-up. This adds no native UI parity claim.

## Referral validation management

Program-scoped validation management is a web administration surface. Its list uses
creation-order keyset pages, and its detail view reads a single program/validation binding.
Swift and .NET have no corresponding management surface in the parity matrix, so these
administrative reads add no native UI parity claim. Public referral-program topic reads
remain part of the existing referral-program client feature.

## Notification mark-all continuation

REST and MCP mark one bounded page, return the immediate `marked_read` count and `has_more`, and
continue the older backlog in background jobs. The web notification page avoids presenting every
loaded row as read while work remains; it refreshes one page and the unread summary on request or
when the tab regains focus or becomes visible. Swift and .NET invoke the endpoint as a mutation without consuming its
result and optimistically present read state. Background continuation usually completes their
mark-all intent, but a lost or terminally failed job leaves unread rows; another mark-all request
resumes them. Their current clients do not automatically retry that case.

## Topic alias unlink

`DELETE /api/v1/topics/:idOrSlug/aliases/:aliasId` accepts the unlink and responds with
`202` and `{ topic_alias_id, topic_id, status: "unlinking" }`. The alias is already absent from
the topic's alias list. Relation removal and publication refresh finish afterward; a later read
shows the finished state. The web admin client ignores the response body. This staff route is not
an MCP tool. Native clients have no topic-alias management surface in the parity matrix, so this
response change does not claim native UI evidence.

## Topic content attribution

The topic-detail response keeps its existing nullable `topic_content_update` shape. Its current
attribution comes from the topic and survives revision-history expiry; an erased actor makes the
whole attribution null. Web, Swift, and .NET need no response-model change. This adds no history or
rollback surface and makes no new native UI parity claim.

## Hostname identity in presentation

On crawler and integrity screens, hostname links and labels use the hostname string. Their reads
include that natural key alongside factual hostname IDs, so clients can show a useful identity
without exposing a UUID in presentation. The ID remains the API and MCP reference for mutations,
joins, and exact reads. Native clients can adopt the hostname fact when rendering these records;
the added response field does not change their existing request contract.

## Landing page candidate paging

The web picker loads eligible candidates in pages and preserves the current draft while loading
more. Saved content remains visible when its candidate lies on an older page. Re-adding removed
content requires loading its eligible candidate page. Swift and .NET adoption of paging and the
effective item cap is tracked in [clients #541](https://github.com/vouchington/vouchington-clients/issues/541);
the candidate-picker row remains partial for both clients until that work has executable evidence.

## Landing page analytics identity

Staff analytics reads identify a landing page by its owner's username and page slug. This matches
the web page's navigable identity while analytics responses retain IDs as data facts. REST and MCP
use the same pair. Swift and .NET route adoption and fixture evidence are tracked in
[vouchington-clients#525](https://github.com/vouchington/vouchington-clients/issues/525).

## Moderation identity in presentation

Staff and member moderation screens display factual labels for reports, integrity flags,
penalties, topic claims, disputes, moderator notes, and review queue entries. IDs remain
in REST and MCP responses for exact references and actions, while titles, slugs, names,
and user identity facts provide the visible label. List producers hydrate these facts
for a page together. Native presentation and its executable evidence are tracked by
[vouchington-clients#526](https://github.com/vouchington/vouchington-clients/issues/526);
this producer change makes no native UI parity claim.

Staff report clusters return `report_count_capped` with the bounded `report_count`, plus
`summary_capped` when `reporter_count` and `reason_breakdown` describe only the bounded sample.
Web marks capped report counts with a compact `+` count (for example, `1K+`) and labels sampled
reporter and reason summaries; native clients should apply the same meanings when adopting this
response contract. Judgement summaries expose precision flags for the report count at judgement
time and the current bounded count; web also marks those lower-bound counts with a compact `+`.

## Saved list and community applicant labels

List-item reads and add responses provide a nullable factual entity label alongside the ID, so web
and native clients can identify saved content without displaying an opaque UUID. Missing labels
remain null in REST and MCP; clients render a localized untitled-post label. Community application reads
include applicant profiles for each page, including applicants who have not joined the community;
clients should display the name or username and use a deleted-user label when the profile is gone.
These response additions preserve IDs for mutations and joins. Native presentation adoption remains
dependent client work in [clients #528](https://github.com/vouchington/vouchington-clients/issues/528)
and does not change a parity claim in the feature matrix.

## Moderation history retention

The producer applies the approved moderation history access window to member appeal reads and
keeps public dispute annotations after their source dispute expires. An annotation's
`review_dispute_id` can therefore be null; the web contract accepts that retained provenance.
[Producer #3639](https://github.com/vouchington/vouchington/issues/3639) owns this retention
contract. Swift and .NET handling of expired appeal history and nullable annotation provenance
still need verification; native executable and rendered evidence has not been assessed, so this
change makes no native parity completion claim.

Platform post-removal appeals expose the final author-safe reason through the existing nullable
`public_reason` field. Private transition notes stay in expiring history and are not copied into
new appeals. This changes no response shape or native parity claim.

Staff `GET /api/v1/disputes` and `GET /api/v1/appeals` rows are summaries. AI drafts, internal
notes, claim text, appeal reasons, original decisions and previews load from
`GET /api/v1/disputes/:id` and `GET /api/v1/appeals/:id` when a row is opened, and web shows them in
a modal. Rows carry `has_ai_draft` and `has_draft` flags instead. The staff MCP
`read_moderation_appeal` list mode returns the same summary rows as `GET /api/v1/appeals`; by-id
still returns full detail, so a client that read drafts or notes from the list must read by id.
Member list rows and the MCP `list_my_review_disputes` output are unchanged. Native staff clients
should read details the same way; that work is a vouchington-clients dependent and gates nothing
here.

## Copyright filing and staff matches

The web notice form discloses whether a filing will be attributed to a signed-in user or a guest.
It sends that expected filer with the submission so the API can reject a changed sign-in state
before creating a notice. Callers without that pre-submit disclosure do not need the expectation
header. Staff copyright queues expose a bounded first page of possible staydown matches and a
`staydown_matches_has_more` signal; reviewing visible matches reveals the next pending matches on
refresh. A territorial (EU or UK) case card on the staff queue carries `complaint_count` and
`dispute_settlement_count`, not the posters, claimants, complaints or settlements themselves; those
load on demand from the paged `territorial-posters` (one page per batch of targets, a row per target
and poster whose `state` and `informed_at` report the notice sent for that target), `territorial-claimants` (one row per filing receipt), `territorial-complaints` and
`eu-dispute-settlements/staff` collections of `/api/v1/copyright-notices/:id`. Native copyright filing and
staff review remain tracked by the existing parity rows in
`client-feature-parity.json`; this change does not claim new native UI evidence.

Repeat-misuse evidence is a bounded latest-notice window, with a claimant-scoped opaque cursor for
separate later windows. The staff-only claimant REST read and legal MCP tool share the same counts
and window metadata; a window's counts are not cumulative. Web labels each window's oldest and
newest original receipt times in the staff member's UI locale. These times describe the notices
in that count-based window, not a fixed calendar period. Delayed ingestion can make receipt-time
ranges overlap between windows. Native staff presentation must preserve separate window counts
and the receipt-time context; this adds no native UI parity claim.

Staff associate email replies with an existing case by claimant, work, or received date. REST and
legal MCP share a bounded candidate search with opaque continuation; an empty result page can
still have a continuation because the cursor advances over scanned candidates. The selected case
ID remains an API fact used for association. Repeat-infringer account reads include a nullable
username so staff presentation does not use a user ID as its label. Swift and .NET contract
fixtures also cover recognizable uploader and inspectable-image context for possible re-uploads,
including unavailable or deleted content. Native adoption and UI evidence are dependent work under
[clients #527](https://github.com/vouchington/vouchington-clients/issues/527).

Staff can preserve an unlinked copyright email receipt after its private intake is erased and
release that hold by its hold id. The API producer lands before staff web or
native controls; client adoption and UI evidence remain tracked under
[clients #1229](https://github.com/vouchington/vouchington-clients/issues/1229).

## Classifier partition operations

The staff engineering `POST /api/v1/psql/jobs` contract accepts an optional
`classifierRange` with UTC `fromDate`, exclusive `toDate`, and `maxDefaultRows`
for operator-created and operator-retired classifier result ranges. An omitted
range keeps the crawl-only monthly action. Web exposes the range inputs and
confirmation in the PostgreSQL operations page. The engineering operations
surface is marked full for Swift and .NET in the feature matrix, so both native
clients need dependent adoption of this request and confirmation flow before
their engineering parity can include classifier ranges. No member-facing route
or MCP tool changes. Native adoption is tracked in
[vouchington-clients#497](https://github.com/vouchington/vouchington-clients/issues/497).

The same engineering action now accepts `requestRange` for export-request history. Web exposes
creation and guarded retirement of aligned request and attempt ranges. Native engineering clients
need the matching request input and confirmation before this addition has parity; the existing
engineering follow-up tracks the client work.

## Annual integrity penalty review

Staff can inspect bounded queues of active report-abuse and vote-weight penalties due for
annual review and confirm continued enforcement. The producer exposes
`GET /api/v1/{report|vote}-integrity/penalties/review-due` and
`POST /api/v1/{report|vote}-integrity/penalties/:id/reviews` to the same staff roles that
can apply each penalty. Admin MCP reaches the due queue with `review_due` on the existing
penalty list tools and records a review with `review` on the existing lift tools. Recording a
review, or lifting a report-abuse penalty, rejects a suspended administrator. Due queues use opaque `after` cursors, bounded `limit`, and `page_info`
so staff can inspect later records without first deciding every older case. Swift and .NET have existing integrity penalty surfaces, but neither
renders this review queue yet. [Clients #492](https://github.com/vouchington/vouchington-clients/issues/492)
owns native presentation, route consumption, and behavioral evidence; native parity stays
dependent until that work is proven.

## Topic merge operations

Topic merge admission returns a pending operation, not a destination topic or a completed merge.
The operation ID identifies the exact request; its status URL reads the same operation after a
retry or reconnect. REST and admin MCP expose the same queued, running, completed, and failed
states. Clients show completion only after that operation completes and present a failed preflight
as a rejected merge. Web keeps the submitted merge pending with an explicit status check. Swift
and .NET adoption is dependent client work; the producer lands first.

Native admission and status presentation are tracked in
[vouchington-clients#517](https://github.com/vouchington/vouchington-clients/issues/517); this
producer change does not depend on native implementation.

## RSS feed submission

REST `POST /api/v1/rss-feeds` and MCP `submit_rss_feed` option `submit` return the same pending
import and `status_url`. Option `import` submits the JSON URL list on
`POST /api/v1/my/import/rss-feeds`. Option `import_status` reads the same page as the private
import status endpoint. `status_url` is not an MCP call, so clients poll with `import.id`. Clients
use the completed row's `entity_id` to open the feed, or map its stable `error_code` to localized
copy. Native client adoption is tracked in
[clients #368](https://github.com/vouchington/vouchington-clients/issues/368); the producer lands
first.

## Trending and top sorts

Trending and top are sort options on the search routes, not routes of their own. `GET /api/v1/rss-feeds`
and MCP `discover_rss_feeds` option `search` take `sort=trending` and `time_range` (`day`, `week`,
`month`). `GET /api/v1/communities` and MCP `discover_communities` option `search` take
`sort=trending`. `GET /api/v1/hostnames` and MCP `read_hostnames` option `search` take
`sort=trust`, which replaces the old top list. Each returns the ordinary search shape with a
sort-key plus id cursor. Trending carries no `trending_score` or count fields. RSS trending takes no
other filter and answers 400 for one. Community and RSS trending read a materialized score
refreshed every five minutes, so a new post or follow can take that long to rank. Removed with no alias: `GET /api/v1/hostnames/top`,
`GET /api/v1/rss-feeds/trending`, `GET /api/v1/trending-communities`, and the MCP options
`read_hostnames.top`, `discover_rss_feeds.trending` and `discover_communities.trending`. Native
adoption is a dependent issue in the clients repository; the producer lands first.

## Staff RSS feed deletion

The staff REST `DELETE /api/v1/rss-feeds/:id` accepts an asynchronous hard delete with HTTP 202
and `{ "rss_feed_id": id, "status": "deleting" }`. The feed is hidden from discovery when accepted. Its source
associations are then removed in bounded committed pages, followed by the feed row; HTTP 202 does
not mean physical deletion has finished. A feed referenced by retained admin import history
returns HTTP 409 before deletion is accepted. Detail reads may remain available during cleanup;
`GET /api/v1/rss-feeds/:id` is not a deletion-progress endpoint or a completion signal.
The web source manager reports that deletion has started. The staff RSS deletion row in
`client-feature-parity.json` records the web behavior and the native gaps. Native adoption is
tracked by [clients #521](https://github.com/vouchington/vouchington-clients/issues/521); this change
does not claim native UI coverage. There is no MCP feed-delete tool. Completed user feed-import results keep their successful status
after the feed is removed, with no linked feed ID in the result.

## Community moderation MCP handoff

Community admission and moderator promotion return distinct HTTP 409 codes,
`COMMUNITY_MEMBERSHIP_LIMIT_REACHED` and `COMMUNITY_MODERATOR_LIMIT_REACHED`, preserved through
MCP. Staff share these limits. Lowering an admission setting leaves existing memberships and
notification recipients intact. Swift and .NET need localized handling that explains the limit
without retrying the unchanged request; dependent adoption is tracked in
[vouchington-clients#539](https://github.com/vouchington/vouchington-clients/issues/539).

The four community moderation tools use exact `community-moderation:read` and
`community-moderation:write` grants on API keys and OAuth; write requires read and user umbrella
grants cover neither. Web consent and credential selection provide localized descriptions.
Post locks, ban-evasion confirmation, and moderator notes use options on these tools with the
same REST authority. Post and note targets do not require an extra community argument. Native
credential and MCP adoption, including the `participate_in_community` option envelope for joining
and member modmail, is tracked in
[clients #218](https://github.com/vouchington/vouchington-clients/issues/218); the producer lands
first. The [scope module](../overview/architecture/backend/README.md) and
[MCP catalog](../overview/architecture/mcp/catalog.md) own the current contract.

Community-list RSS feed additions return HTTP 422 with
`community_list_feed_limit_reached` and a numeric `limit` through REST. The community moderation
MCP write shares the service's 422 error. Web shows localized guidance using that limit. Native
presentation of this failure is unverified; clients should use the same code and fact when they
adopt it.

## MCP audience selection

MCP API keys choose one eligible server audience, and switching servers clears the prior scope
selection. OAuth apps may offer scopes across audiences; each eventual authorization and access
token still binds to one protected resource. The shared scope catalog exposes server eligibility and
separate moderator/admin and administrator-only eligibility, while web credential pickers and consent group permissions by server with
localized labels. Native agent server selection and credential-picker adoption remain dependent
client work under [the MCP audience split](https://github.com/vouchington/vouchington/issues/3179).
The producer lands first; audience routing does not change tool arguments or results.

## Native in-app MCP session

First-party native chat uses the signed-in native session to mint a user-MCP bearer token without a
second browser authorization. The web settings UI shows the resulting grant beneath its session,
including attestation status and a grant-only revoke action. Web login sessions cannot mint. Native
OTP uses its dedicated entry point, while third-party OAuth consent remains unchanged. The producer
publishes the native OTP and mint contracts before [clients #210](https://github.com/vouchington/vouchington-clients/issues/210)
adopts them in Swift and .NET. See the [authorization decision](security/OAUTH-AUTHORIZATION-SERVER.md#first-party-native-clients).

## Direct-message MCP consent

Direct-message access uses explicit private-data grants, with localized read and write descriptions
on web consent and credential selection. The shared scope catalog now carries these descriptions,
so native credential pickers must recognize them before requesting DM access; umbrella grants do
not include it. Native credential adoption remains tracked in
[clients #177](https://github.com/vouchington/vouchington-clients/issues/177), and MCP option/result
adoption in [clients #218](https://github.com/vouchington/vouchington-clients/issues/218). The
producer lands first. The [MCP catalog](../overview/architecture/mcp/catalog.md) owns the tool
contract; AI chat transcripts are outside this DM decision.

## Brand topic-claim MCP

Brand topic claims use exact `topic-claims:read` and `topic-claims:write` grants on the brand MCP
audience. Web consent and credential selection show the localized descriptions. Umbrella user grants
do not include them. The tools do not award ownership; domain proof or staff review does. Native
consent and credential adoption is a vouchington-clients follow-up; the producer lands first. The
[MCP catalog](../overview/architecture/mcp/catalog.md) owns the tool contract.

Topic-claim list reads expose cursor pagination in REST and MCP. Web claim and dispute flows use
server-side claimant, state, and reviewed-topic filters so an unrelated first page cannot hide a
relevant claim. Native clients consuming these reads must follow `page_info` cursors and preserve
the same filters when adopting the current contract.

## Household MCP consent

Household tools require explicit `households:read` and `households:write` grants. Write requires
read, and umbrella grants cover neither. Web consent and credential selection show localized copy
for both. Native clients need the same descriptions before requesting household access; a dependent
`vouchington-clients` issue is needed. The producer lands first. The
[MCP catalog](../overview/architecture/mcp/catalog.md) owns option and result schemas.

## AI review admission and results

An accepted AI review request confirms that work was queued. Client and staff presentation paths
keep the item pending and read the authorized resource until the saved recommendation or draft is
visible; the enqueue response itself carries no model result. Web implements this separation for
moderation appeals, disputes, reports, copyright review, and copyright email intake.

Staff report judgement and appeal reruns receive opaque exact run IDs. Authorized staff reads of
the parent and run return a durable `active`, `succeeded`, `failed`, or `expired` outcome independent
of queue-job cleanup; the report result includes its actual judgement ID on success. Appeal
exact-run result reads are a new staff-only contract. The report result contract uses `run_id` and
`status` in place of `completed`. A different judgement, a prior
run's late response, or a transiently missing run cannot complete or release the current pending
admission. Definitive failure or expiry releases its controls so staff can retry; a missing run
remains inconclusive, including after finite retention. A client polling deadline shows a refresh
prompt while keeping the exact admission locked; it does not establish a terminal outcome. Appeal
owners still receive their redacted
appeal view without internal run outcomes. Staff dispute reconciliation and report lists read the
primary. After completion, clients read the originating report directly instead of chasing
collection pages. This lean detail returns persisted report fields and the current judgement
identity or null; matching text never substitutes for a persisted judgement ID. REST and MCP share
moderator/admin access. Native adoption remains in clients #373. Staff report lists
expose `automatic_judgement_enabled` for each report, based on the current community AI setting and
target. The community moderation queue exposes it only to site staff. Clients poll an ordinary
pending report automatically only when this is true; an explicitly admitted staff rerun still polls
when it is false. Member report lists omit the field. Copyright queues refresh every loaded page, and
staff polling stops after a bounded wait with a visible refresh prompt. Native adoption is tracked
as dependent client work under
[clients #373](https://github.com/vouchington/vouchington-clients/issues/373) for reports and
[clients #375](https://github.com/vouchington/vouchington-clients/issues/375) for appeals; the
producer lands first.

## Household membership create

`POST /api/v1/households/:id/memberships` returns the same membership object as one result of
`GET /api/v1/households/:id/memberships`, including the individual's user id and username.
`PATCH /api/v1/households/:id` is gone. Web does not call either route; its membership type already
matches the list item. Native clients that decode the previous narrower create body, or that call
the removed update route, need a dependent client change. The producer lands first. Household MCP
tools stay out of this change.

## Household invitations

Household invitations have full web support; Swift and .NET client adoption remains pending.

Invitations require the invitee's decision before another user's individual joins a household. Web
provides owner and invitee actions on the household page and opens that page from invitation
notifications. Household MCP tools share the REST authority and invitation lifecycle. Swift and
.NET household management remains partial until these actions and notifications are adopted.
Creating a household, adding a member, and accepting an invitation can return 409 when the
counted admission limit is already reached. Two creates at the same moment can both pass, so
the household can end up with one more than the limit. The error `code` is the contract:
`HOUSEHOLD_LIMIT_REACHED`,
`HOUSEHOLD_MEMBER_LIMIT_REACHED`, or `INDIVIDUAL_HOUSEHOLD_LIMIT_REACHED`. Web toasts code-specific
copy on household create and invitation accept. Native clients should do the same when they adopt
these actions
([clients#470](https://github.com/vouchington/vouchington-clients/issues/470)).

Invitation responses now include the invitee, inviter, and household owner's nullable usernames
alongside their IDs. Web uses those response facts for every page of invitation rows, including
loaded pages, so it never needs to display a household UUID or fetch profiles for each row. Native
adoption should use the same identities and safe fallback when a username is absent.
[Native adoption is tracked in vouchington-clients#470](https://github.com/vouchington/vouchington-clients/issues/470). The producer lands first.

## Provider sign-in conflicts

Provider sign-in resolves an existing identity by provider and provider user ID. A provider email
matching a registered email requires the user to sign in with their existing method and connect
the provider from settings. Web, Swift, and .NET clients should compose that guidance from the
factual conflict code and preserve the existing sign-in and connect flows. The producer lands first;
client copy adoption remains dependent client work.

## OAuth consent identity

Authorization runs in the browser for web and native callers. Consent identifies a registered app
with its selected callback host and an unverified label, alongside localized permission descriptions.
The authorization-request response includes `client_is_unverified`; `client_hostname` is the
metadata host for CIMD/native clients and the selected callback host for registered clients.
The web owns rendering this browser flow; native clients continue to open the authorization URL.
Dynamic registration cannot reserve first-party names or authorize staff resources.

## Browser challenge context

Browser challenge producers identify the operation when rendering a Turnstile widget. Server
verification binds that result to the configured site and the operation being requested. Native
App Attest retains its existing operation tags; clients that embed a browser challenge need the
same action mapping and configured web origin. Native adoption is tracked in
[vouchington-clients#486](https://github.com/vouchington/vouchington-clients/issues/486), with the
producer landing first.

## Low-score mutation challenge

When Cloudflare supplies a low bot score for a cookie-authenticated mutation, the API returns a
challenge-required code and canonical operation tag before running the mutation. Web maps that tag
to the Turnstile action while native clients use the tag in the signed assertion payload. The client
completes that proof and retries the unchanged request once; it does not retry another challenge or
an ambiguous mutation failure. Missing Bot Management metadata leaves the request unchanged, which
is the expected free-zone behavior. Native clients may use a cryptographically verified App Attest
request or operation challenge instead of Turnstile. A native operation challenge selects that
proof path by putting the shared `app-attest` marker in the generic bot-challenge token header;
the marker grants no authority, and the assertion still verifies against the canonical operation.
The generic assertion uses its dedicated bot-challenge App Attest headers, leaving an existing
route-specific challenge for its owning verifier. Before retrying, native clients re-sign that
route proof after generating the generic proof so its monotonic device counter remains newer. The
browser-challenge follow-up remains
[vouchington-clients#486](https://github.com/vouchington/vouchington-clients/issues/486), with the
producer landing first.

## Browser session refresh

Browser credentials use cookies, stable browser-family/platform binding, and optional trusted
Cloudflare fingerprint binding. Renewal rotates the device credential while retaining its original
expiry; replay requires signing in again. Only verified App Attest devices receive native session
lifetimes. Swift and .NET retain JSON transport and must coordinate refresh across callers and
recover through login when renewal fails. Native adoption is tracked in
[vouchington-clients#487](https://github.com/vouchington/vouchington-clients/issues/487).
The producer lands first. Device-bound session proof is a separate browser capability.

## Device-bound browser sessions

Web credential completion can advertise browser-managed DBSC registration on the configured HTTPS
site. Capable browsers prove possession of their registered key when renewing the access cookie;
bound sessions cannot use ordinary device-cookie renewal. Unsupported browsers retain unbound web
sessions. Swift and .NET do not implement this browser protocol and keep their native token and
attestation flows. Registration and renewal responses follow the external DBSC wire format.

## Email verification codes

Email sign-in and account email verification use the shared base32 code contract. Reauthentication
codes are restricted to their requested flow, and requesting a replacement invalidates the older
unused code for that same flow. Email reauthentication stays in the browser or device session that
requested it; replacing one session’s challenge does not interrupt another session’s challenge.
Web login links prefill the code and require deliberate submission.
Swift and .NET OTP input, validation and deep-link presentation must adopt the producer contract;
client implementation is dependent work and the producer lands first.

## Fresh authentication for account settings

Web prompts for fresh authentication before email-address changes, passkey or TOTP enrollment and
removal, and provider connection changes, including Bluesky. The server consumes a separate proof for each mutation,
revokes other sessions, and notifies the primary address captured before the change. Broker
connections carry the proof at authorization initiation. An administrator must complete MFA in the
current session before using staff authority; enrollment alone does not elevate that session.
Fresh proof belongs to the requesting device and session. Users can prove control with their current
primary email, authenticator, a selected owned passkey, or a fresh roundtrip through an already
linked provider. Provider and passkey settings proofs do not add MFA assurance to that session.

Swift and .NET must carry the fresh proof through the same settings actions and handle
`MFA_REAUTH_REQUIRED` by prompting again. Native adoption requires the same provider and passkey proof options and recovery behavior.
The producer lands first; existing native settings calls
without a proof are rejected. Shared email request fixtures include the carrier, and native
behavioral coverage must exercise successful changes, missing proofs, and revoked sessions.

## Community application review rows

`GET /api/v1/communities/:idOrSlug/applications` and MCP `list_applications` return summary rows
under `community_application_summaries`: applicant, status, a message preview, `answer_count`, and
`created_at`. Answers and the full message load from `GET .../applications/:id` (MCP
`read_application`) when a moderator opens a row. Swift and .NET consume the list fixture and must
move to the summary type with the producer. Client work is dependent and does not gate this
repository.

## Community agent prompt list pagination

The moderator-only REST prompt list returns a bounded page with an opaque `page_info` cursor. Its
`slot_info` remains a creator-wide allocation summary across communities, independent of the
current community page. Prompt creation is capped per creator and community; a full cap returns
`COMMUNITY_AGENT_PROMPT_LIMIT_REACHED` with HTTP 409. This is a REST-only surface; no MCP prompt
creation or listing tool exists. Web and native consumers must continue through pages instead of
treating the first response as the complete list. Native adoption is tracked in the client parity
contract.

## Post time range

`GET /api/v1/posts` and `GET /api/v1/communities/:idOrSlug/posts` (MCP post search and
`read_community` option `posts`) accept a `time_range` code. On post search, omitting the range
leaves the age filter off. An explicit finite code, including `1m`, is a strict age filter, and
continuation keeps that first-page bound. Explicit `all` is also unfiltered, and its cursors are
not interchangeable with an omitted range. Community post lists keep their own default age bound
and do not treat drafts as an opt-out.
For post search, Swift and .NET must offer a Default choice that omits `time_range`, alongside
the explicit web range options, and send a code only for an explicit choice. They must page with
the returned cursor under the same range. Client work is dependent (vouchington-clients#537) and
does not gate this repository.

## Shared post discovery filters and ranking

REST post search, community post lists, and MCP post search share one discovery walk. Trending
posts are `GET /api/v1/posts?sort=trending` on REST and the same sort on MCP. Hot and trending
pagination uses an opaque cursor tied to a fixed-epoch rank; near-tie order can differ from
request-clock ranking, and cursors from the prior rank are refused. Each page orders by its sort
key and stops at `limit + 1`. A short page has `has_next_page` false. Keyword relevance orders by
ranking score, then id. Hashtag terms are ANDed together after linked aliases collapse to their
topic. Excess hashtag terms are rejected equally by REST and MCP. A similar-post seed that a
signed-out reader cannot read returns an empty page on both surfaces. Signed-in search omits
authors, topics, and hostnames that caller has muted or blocked.
Native catalog and result-fixture adoption remains tracked in
[vouchington-clients#398](https://github.com/vouchington/vouchington-clients/issues/398); this
producer contract makes no new native UI parity claim. REST post-list cursor and time-range adoption
remains tracked in [vouchington-clients#537](https://github.com/vouchington/vouchington-clients/issues/537).

The public posts RSS document exposes Atom `rel="next"` only when the post-search page has another
row. The link carries the opaque cursor and the same filters. This is an external feed-reader
contract and makes no native RSS client parity claim.

## Comment descendant head pagination

REST and MCP page immediate-child heads and attach bounded reply previews. A continuation cursor
advances past inspected heads, so a page may be short or empty while `has_next_page` remains true.
Clients follow `page_info` rather than inferring completion from result count. Individual responses
order their ids; concatenated pages need not preserve global descendant-id order. Replies beyond a
preview are expanded through the same descendants call rooted at a returned comment, including a
placeholder. Web preserves that route through comment permalinks and its existing pagination.

Swift and .NET adoption is tracked in
[vouchington-clients#543](https://github.com/vouchington/vouchington-clients/issues/543) and does not
block the producer. No native parity completion is claimed here.

## Story and data-point search pages

`GET /api/v1/posts?post_types=story` and MCP `read_posts` rank story posts with the normal post
page for new, best, and hot. A story post is included when `story_posts` links it to a live story
that has a feed item in an enabled, discoverable, undeleted feed. REST and MCP `read_posts` search
use that same post page, with `post_types=data_point` and enum-validated result and credit-score
filters, and return
`page_info`. Clients page with the returned post cursor. Swift and .NET follow the producer and
do not gate this repository. Topic data-point insights use MCP `read_topic` with the
`data_point_insights` option and `topics:read`; data-point search uses `posts:read`. Clients
request those resource scopes.

## Web search pages

`GET /api/v1/web-search` and MCP `search_web` accept `after`, the opaque `page_info.end_cursor` of
the previous page. Content matches rank within a capped chunk set (`web-search-config.chunk_cap`)
and URL-string matches follow them, so a page can be short; `has_next_page` and `end_cursor` are
the only signal that more exists. A cursor is bound to its query and a foreign or malformed one is
HTTP 400 on REST and `Invalid cursor` on MCP, as the other cursor routes do. Web already pages
through `usePaginatedList` and keys rows by `url.id`. Swift and .NET adopt `after` as dependent
clients-repo work and do not gate this repository.

## Relation admission

REST and MCP share the same refusal when an account cannot add another follow or subscription of
that type. The API returns HTTP 409 with `RELATION_LIMIT_REACHED`; clients compose localized
recovery guidance from the code and requested action. Web retains the previous
button state and explains that removing another relation of the same type frees room. Imports
report skipped additions rather than presenting them as successful follows.

Related URL additions use the same refusal code and status when a post has no remaining
capacity. REST and MCP share that decision, including source URL creation and story projection
writes. Existing active relations remain valid when capacity is lowered; adding another URL
requires removing enough active relations to make room. This preserves the existing response
shape and makes no new native UI parity claim.

Swift and .NET adoption is tracked in [vouchington-clients#538](https://github.com/vouchington/vouchington-clients/issues/538). Native implementation
does not gate the producer, and this change makes no new native UI parity claim.

## Hacker News reference facts

REST and MCP expose the same stored Hacker News facts for posts, feed items, and story members:
list reads carry batched counts, and individual detail reads carry bounded reference links.
Hiding references suppresses these facts and leaves a requested reference filter inactive in both
transports. Pausing external lookups changes freshness independently of presentation.

Personalized feeds apply the reference filter before deduplication and pagination. The web time-range
cap controls the checkbox interaction without changing the API's accepted time ranges. HN-filtered hot
searches retain hot ranking for every range, but the server restricts their eligible cohort to at most
30 elapsed days; narrower requested windows remain narrower.

REST and MCP post feeds walk eligible deliveries in sort order. Clients continue with
`page_info.end_cursor` only while `has_next_page` is true, and they keep the same filters.

Swift and .NET must remove the personal discussions preference and client-side lookup, consume stored
reference facts, and honor the producer's visibility behavior. Their adoption remains dependent work
in [vouchington-clients#532](https://github.com/vouchington/vouchington-clients/issues/532); this producer
change makes no new native UI parity claim.

## Personalized RSS horizon and follow union

Personalized RSS returns the recent publication horizon, including when callers request a longer time range. The existing narrower selection remains narrower. RSS `all` and `any` both match followed sources or followed topics; a direct item matching both appears once. The response shape and last-returned delivery cursor stay unchanged. Share deliveries keep their independent identities, and their target items must also be recent. Native callers currently use the default horizon; [the client follow-up](https://github.com/vouchington/vouchington-clients/issues/546) owns contract verification and any client-facing explanation.

## Community ban moderation

Community ban history uses paged summaries; moderators open a ban to read its reason and lift it individually. The explicit confirmed lift-all action can refuse protected issuers or a bounded batch, in which case permitted bans can be lifted individually. REST and MCP share these operations and outcomes. Native adoption is tracked in [clients #555](https://github.com/vouchington/vouchington-clients/issues/555); the producer lands first and this change makes no native UI parity claim.

## Unified post writes

Topic recommendations, story discussions, and RSS link discussions use the post write contract.
Their specialized validation and preparation still run behind that contract; recommendation edits
retain ownership and pending-state rules, and story creation retains source discoverability.
Web submits these sources through post creation and uses the ordinary post mutation response.
Swift and .NET adoption is tracked in
[vouchington-clients#544](https://github.com/vouchington/vouchington-clients/issues/544) and follows
the producer without gating this repository.
