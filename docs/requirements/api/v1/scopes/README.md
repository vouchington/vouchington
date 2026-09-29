# Scopes API

Source entrypoint: [backend/api/v1/scopes/README.md](../../../../../backend/api/v1/scopes/README.md)

## Endpoints

| Method | Route            | Authentication | Description                          |
| ------ | ---------------- | -------------- | ------------------------------------ |
| GET    | `/api/v1/scopes` | Optional       | List the canonical credential scopes |

The response is `{ scopes }`, sorted by `scope`. Each entry carries `scope`, `resource`, `action`
(`read` or `write`), `audience` (`user`, `api` or `admin`), `requires` (the prerequisite scope a
write needs, or `null`), `description_key` (a stable presentation identifier or `null`) and
`surfaces` (`api-key`, `oauth`). `mcp_user_full_access` and `mcp_admin_full_access` distinguish
the user and administrator MCP umbrella meanings. Clients map these identifiers through their own
localized typed catalogues. They must reject unknown values and must not render server English.
Web and native API-key and OAuth app
pickers render this list rather than hard-coding scope strings, so adding a scope is a data change
for every client. Administrator-audience scopes are listed for everyone; clients hide them from
non-administrators, and credential creation enforces the audience server side. Anonymous responses
are publicly cacheable for the short cache interval.

## Performance

| Endpoint             | Round Trips | Caching                          | Notes                                        |
| -------------------- | ----------- | -------------------------------- | -------------------------------------------- |
| `GET /api/v1/scopes` | 1           | HTTP: anon Cache-Control (short) | Auth check; the catalogue is in-process data |

## Related

- [Scope module](../../../../overview/architecture/backend/modules/scopes/README.md)
- [API keys requirements](../../../users/api-keys.md)
