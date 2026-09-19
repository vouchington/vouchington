# `@modules/scopes`

Canonical scope catalogue and strict parser shared by API-key and OAuth authorization surfaces.

Scopes use `<resource>:<action>`. Resources are lowercase dot-delimited identifiers and actions are
`read` or `write`. Only catalogue entries are valid; callers must not normalize case or whitespace.
The validator rejects duplicates, missing prerequisite scopes, unsupported credential surfaces, and
mixed audiences unless the caller explicitly permits an OAuth grant to span audiences.

API-key type and owner-role policy remains in `@services/api-keys`. Per-tool scope declarations and
enforcement remain in the MCP registry.

## Related

- [API keys](../../../docs/requirements/users/api-keys.md)
- [Backend module rules](../README.md)
