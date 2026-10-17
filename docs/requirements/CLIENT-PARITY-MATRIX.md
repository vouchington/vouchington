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

## Community moderation MCP handoff

The four community moderation tools use exact `community-moderation:read` and
`community-moderation:write` grants on API keys and OAuth; write requires read and user umbrella
grants cover neither. Web consent and credential selection provide localized descriptions.
Post locks, ban-evasion confirmation, and moderator notes use options on these tools with the
same REST authority. Post and note targets do not require an extra community argument. Native
credential and MCP adoption is tracked in
[clients #218](https://github.com/vouchington/vouchington-clients/issues/218); the producer lands
first. The [scope module](../overview/architecture/backend/README.md) and
[MCP catalog](../overview/architecture/mcp/catalog.md) own the current contract.
