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

REST `POST /api/v1/rss-feeds` and MCP `submit_rss_feed` return the same pending import and
`status_url`. Clients poll the private import status endpoint and use the completed row's
`entity_id` to open the feed, or map its stable `error_code` to localized copy. Native client adoption is tracked in
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

## MCP audience selection

MCP credentials bind to one protected resource, so community moderators and copyright staff use
the audience that owns their tools. Native agent server selection and credential-picker adoption
remain dependent client work under [the MCP audience split](https://github.com/vouchington/vouchington/issues/3179).
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

## AI review admission and results

An accepted AI review request confirms that work was queued. Client and staff presentation paths
keep the item pending and read the authorized resource until the saved recommendation or draft is
visible; the enqueue response itself carries no model result. Staff report judgement reruns compare
the persisted judgement identity because a completed rerun may produce the same text. Web implements
this separation for moderation appeals, disputes, reports, copyright review, and copyright email
intake. Staff dispute reconciliation requests a primary read; queued report reruns are serialized
per entity so each completion can be attributed. Copyright queues refresh every loaded page, and
staff polling stops after a bounded wait with a visible refresh prompt. Native adoption is tracked
as dependent client work under
[clients #373](https://github.com/vouchington/vouchington-clients/issues/373); the producer lands first.
