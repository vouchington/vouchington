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

## RSS feed submission

REST `POST /api/v1/rss-feeds` and MCP `submit_rss_feed` option `submit` return the same pending
import and `status_url`. Option `import` submits the JSON URL list on
`POST /api/v1/my/import/rss-feeds`. Option `import_status` reads the same page as the private
import status endpoint. `status_url` is not an MCP call, so clients poll with `import.id`. Clients
use the completed row's `entity_id` to open the feed, or map its stable `error_code` to localized
copy. Native client adoption is tracked in
[clients #368](https://github.com/vouchington/vouchington-clients/issues/368); the producer lands
first.

## Community moderation MCP handoff

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
staff-only policy, while web credential pickers and consent group permissions by server with
localized labels. Native agent server selection and credential-picker adoption remain dependent
client work under [the MCP audience split](https://github.com/vouchington/vouchington/issues/3179).
The producer lands first; audience routing does not change tool arguments or results.

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
visible; the enqueue response itself carries no model result. Staff report judgement reruns receive
an opaque UUIDv7 run ID at admission and poll that exact run's authorized result. Another automatic
or staff judgement on the same entity does not complete the admitted run. Web implements
this separation for moderation appeals, disputes, reports, copyright review, and copyright email
intake. Staff appeal and dispute reruns use opaque request-derived run IDs that remain unique across
queue restarts. Each staff resource exposes the current requested run and the run that saved its draft;
clients continue polling within the original deadline until those IDs match, even when another
staff request supersedes theirs. A prior job cannot overwrite the newer request's draft. Staff
dispute reconciliation and report lists read the primary. Report rerun result reads use the report
ID and run ID together, and the worker reuses a saved exact result on retry. Staff report lists
expose `automatic_judgement_enabled` for each report, based on the current community AI setting and
target. The community moderation queue exposes it only to site staff. Clients poll an ordinary
pending report automatically only when this is true; an explicitly admitted staff rerun still polls
when it is false. Member report lists omit the field. Copyright queues refresh every loaded page, and
staff polling stops after a bounded wait with a visible refresh prompt. Native adoption is tracked
as dependent client work under
[clients #373](https://github.com/vouchington/vouchington-clients/issues/373); the producer lands first.

## Household membership create

`POST /api/v1/households/:id/memberships` returns the same membership object as one result of
`GET /api/v1/households/:id/memberships`, including the individual's user id and username.
`PATCH /api/v1/households/:id` is gone. Web does not call either route; its membership type already
matches the list item. Native clients that decode the previous narrower create body, or that call
the removed update route, need a dependent client change. The producer lands first. Household MCP
tools stay out of this change.

## Household invitations

| Capability                                                                                | Web  | Swift                   | .NET                    |
| ----------------------------------------------------------------------------------------- | ---- | ----------------------- | ----------------------- |
| Invite an existing user; review, accept, decline, or revoke pending household invitations | Full | Pending client adoption | Pending client adoption |

Invitations require the invitee's decision before another user's individual joins a household. Web
provides owner and invitee actions on the household page and opens that page from invitation
notifications. Household MCP tools share the REST authority and invitation lifecycle. Swift and
.NET household management remains partial until these actions and notifications are adopted.
Invitation responses now include the invitee, inviter, and household owner's nullable usernames
alongside their IDs. Web uses those response facts for every page of invitation rows, including
loaded pages, so it never needs to display a household UUID or fetch profiles for each row. Native
adoption should use the same identities and safe fallback when a username is absent.
[Native adoption is tracked in vouchington-clients#470](https://github.com/vouchington/vouchington-clients/issues/470). The producer lands first.
