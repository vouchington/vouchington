# Content Provenance

Which channel created each piece of user content, and which OAuth client acted when an agent did.

## Why

- Voucha can't block AI agents. It steers them to the API and MCP
  ([agent access](../platform/agent-access.md)) and shows users when content arrived through those
  paths.
- Provenance is **declared** by the credential that made the write. The `ai-generated` moderator
  label is **detected** from the text by the moderation pipeline. The two answer different
  questions and neither replaces the other.

## Trust grades

The channel enum separates telemetry-grade channels (the first-party web, Swift, and .NET clients)
from credential-grade ones (`api` and `mcp`). First-party channels derive from forgeable request
headers, so only the credential-grade channels may be shown publicly, as "via API", "via MCP", or
"via {app}". The `system` channel is server-assigned and stays internal. See
[request client info](../../overview/architecture/request-client-info.md) for why the
classification can be forged.

- A session origin with missing or invalid client information cannot create content. It fails
  closed, so an unknown channel is never recorded.
- Only a reviewed allowlist of OAuth clients earns a public display name. Otherwise the label shows
  the metadata hostname, a staff-verified name, or just "via API" / "via MCP", because a client's own
  mutable name must not be trusted for public display.
- Staff see every channel and the raw OAuth client. Reports, appeals, community applications,
  referral links, import batches and conversation messages record a channel but never expose it.
- Anonymous posts never reveal provenance that would identify the author.

## AI authorship disclosure

AI disclosure belongs to the author: an automated account with a live agent renders **AI Agent**,
other automated accounts render **System**, and reserved people and qualifying role-bearing members
render **Official**. See
[account permissions](../trust-safety/reference-trust-system-official-accounts-and-material-connections.md#official-account-permissions).
