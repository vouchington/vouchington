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

`copyright-notices:write` is an exact admin-audience OAuth grant requiring
`copyright-notices:read`; neither is implied by `mcp.admin:*`, and API keys cannot carry them.
Granting write does not activate the tools: the separate default-off operator switch is governed
by the [copyright runbook](../../../../../runbooks/copyright-notices.md#copyright-mcp-decision-tools).
Consent and scope pickers consume the generated scope catalog rather than a separate copyright
permission list.

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

`profile:read/write`, `notifications:read/write`, and `preferences:read/write` are user-audience
resource scopes for the profile, notification, and preference write tools. Each write requires its
read, `mcp.user:read` with `mcp.user:write` covers them, and none is an exact grant. `profile:read`
already authorized `get_my_profile`, so a profile write grant also lets the credential read the
profile. See
[Profile, Notification, and Preference Write Tools](../../../agent-tools/profile-notification-write-tools.md).

`hostnames:read` and `users:read` are user-audience resource scopes for the hostname and user MCP
read tools. Both tools read as a signed-out reader whatever the credential owner's role, so neither
scope exposes a blocked hostname or a private profile field, and `mcp.user:read` covers them like
every other user read scope. `lists:read` also covers the list read tools; it never reads a private
list on its own.

`web-search:read` and `reference-data:read` are user-audience resource scopes for the `search_web`
tool and the country, currency and platform statistics tools; both read the public data the
signed-out REST routes return, and `mcp.user:read` covers them. The trending, referral program and
own referral link read tools reuse `communities:read`, `topics:read` and `referral-links:read`. See
[Trending, Referral, Search and Reference Read Tools](../../../agent-tools/search-reference-read-tools.md).

`post-relations.owned-private:write` is an exact, non-inheritable user capability. It requires
`entity-relations:write` (and therefore read) for API keys and OAuth grants, but broad
`mcp.user:write` never covers it. The `set_bookmark` and `add_list_item` MCP tools check the same
grant before they touch an own private post, as does `remove_entity_relation`, and `get_my_lists`,
`get_list` and `get_list_items` check it before they return an own private list; `bookmarks:write`,
`lists:write` and `lists:read` never imply it.

`referral-links` and `topic-recommendations` are ordinary user read/write resources (write requires
read). `topic-recommendations:read` reads the holder's own recommendations through
`list_my_topic_recommendations`, whatever their status, including a moderator's rejection reason, and
is the prerequisite the write tools declare. A credential that carries it lists only the
recommendations its owner submitted.

The same coverage rule (`hasEveryScope`) decides whether an OAuth client's registered scopes cover
a requested scope. `listScopesForAudience` feeds OAuth discovery metadata, and
`withScopePrerequisites` completes the scope set an MCP `insufficient_scope` challenge asks for.

## Related

- [API keys](../../../../../requirements/users/api-keys.md)
- [Backend module rules](../README.md)
