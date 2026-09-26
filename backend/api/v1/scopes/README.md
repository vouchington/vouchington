# Scopes API

## Endpoints

| Method | Route            | Authentication | Description                          |
| ------ | ---------------- | -------------- | ------------------------------------ |
| GET    | `/api/v1/scopes` | Optional       | List the canonical credential scopes |

The response is `{ scopes }`, sorted by `scope`. Each entry carries `scope`, `resource`, `action`
(`read` or `write`), `audience` (`user`, `api` or `admin`), `requires` (the prerequisite scope a
write needs, or `null`) and `surfaces` (`api-key`, `oauth`). Web and native API-key and OAuth app
pickers render this list rather than hard-coding scope strings, so adding a scope is a data change
for every client. Administrator-audience scopes are listed for everyone; clients hide them from
non-administrators, and credential creation enforces the audience server side. Anonymous responses
are publicly cacheable for the short cache interval.

## Performance

| Endpoint             | Round Trips | Caching                          | Notes                                        |
| -------------------- | ----------- | -------------------------------- | -------------------------------------------- |
| `GET /api/v1/scopes` | 1           | HTTP: anon Cache-Control (short) | Auth check; the catalogue is in-process data |

## Related

- [Scope module](../../../modules/scopes/README.md)
- [API keys requirements](../../../../docs/requirements/users/api-keys.md)
