# `@modules/scopes`

Source entrypoint: [backend/modules/scopes/README.md](../../../../../../backend/modules/scopes/README.md)

Canonical scope catalogue and strict parser shared by API-key and OAuth authorization surfaces.

Scopes use `<resource>:<action>`. Resources are canonical lowercase identifiers. Catalogued action names include `read` and `write` as well as explicit administrative capabilities. Only catalogue entries are valid; callers must not normalize case or whitespace.
The validator rejects duplicates, missing prerequisite scopes, unsupported credential surfaces, and
mixed audiences unless the caller explicitly permits an OAuth grant to span audiences. Graph
validation, prerequisite expansion, audience and surface filtering, and coverage walks come from
`@vouchington/utils/scopes`. This module keeps the catalogue, compatibility grants, and
authorization decisions.

Admin resource scopes are OAuth-only. Moderation, account enforcement, and site-operation ordinary reads/writes inherit matching `mcp.admin:*` grants. Explicit approval, AI-rerun, agent-vote, sanction, queue/config/job, copyright, analytics, and editorial capabilities set `requiresExactGrant`; neither an umbrella nor a sibling scope covers them. Writes retain their matching read prerequisite. The shared authorization request presents these exact grants through `sensitive_scopes`.

`listScopeCatalog()` projects the catalogue into the wire shape served by
[`GET /api/v1/scopes`](../../../../../requirements/api/v1/scopes/README.md), so clients build pickers from data. Its
nullable `description_key` is stable presentation metadata, not server-owned display text.
`mcp_user_full_access` and `mcp_admin_full_access` distinguish the two MCP umbrella meanings;
Financial profile and spending entries carry distinct read/write description identifiers; other entries return `null`. Each client maps recognized identifiers through its own typed
localized catalogue and rejects unknown identifiers rather than rendering server English.

API-key type policy remains in `@services/api-keys`. MCP tool records declare their
required canonical scopes in registry metadata; the registry validates surface audience and both
listing and calling enforce the same requirement. `mcp.user:*` remains an explicit compatibility
grant for existing keys, while new keys can request a resource scope. `mcp.admin:*` accepts only
the `oauth` surface: administrator MCP access is OAuth-only, so no API key can carry it.

`communities:read` is a user-audience resource scope for the community MCP read tools. It covers only
public community data: the tools read as a signed-out reader whatever the credential owner's
membership, so the scope never exposes a private community. `mcp.user:read` covers it like every
other user read scope.

`post-relations.owned-private:write` is an exact, non-inheritable user capability. It requires
`entity-relations:write` (and therefore read) for API keys and OAuth grants, but broad
`mcp.user:write` never covers it. The `set_bookmark` and `add_list_item` MCP tools check the same
grant before they touch an own private post, as does `remove_entity_relation`; `bookmarks:write` and
`lists:write` never imply it.

`referral-links` and `topic-recommendations` are ordinary user read/write resources (write requires
read). `topic-recommendations:read` has no read tool yet: it exists as the prerequisite the write
tools declare, so a credential that carries only it can list nothing.

The same coverage rule (`hasEveryScope`) decides whether an OAuth client's registered scopes cover
a requested scope. `listScopesForAudience` feeds OAuth discovery metadata, and
`withScopePrerequisites` completes the scope set an MCP `insufficient_scope` challenge asks for.

## Related

- [API keys](../../../../../requirements/users/api-keys.md)
- [Backend module rules](../README.md)
