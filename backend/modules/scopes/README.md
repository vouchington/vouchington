# `@modules/scopes`

Canonical scope catalogue and strict parser shared by API-key and OAuth authorization surfaces.

Scopes use `<resource>:<action>`. Resources are lowercase dot-delimited identifiers and actions are
`read` or `write`. Only catalogue entries are valid; callers must not normalize case or whitespace.
The validator rejects duplicates, missing prerequisite scopes, unsupported credential surfaces, and
mixed audiences unless the caller explicitly permits an OAuth grant to span audiences.

`listScopeCatalog()` projects the catalogue into the wire shape served by
[`GET /api/v1/scopes`](../../api/v1/scopes/README.md), so clients build pickers from data.

API-key type and owner-role policy remains in `@services/api-keys`. MCP tool records declare their
required canonical scopes in registry metadata; the registry validates surface audience and both
listing and calling enforce the same requirement. `mcp.user:*` and `mcp.admin:*` remain explicit
compatibility grants for existing keys, while new keys can request a resource scope.

## Related

- [API keys](../../../docs/requirements/users/api-keys.md)
- [Backend module rules](../README.md)
