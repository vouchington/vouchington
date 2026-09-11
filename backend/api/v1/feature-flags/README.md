# Feature Flags API

## Endpoints

### GET /api/v1/feature-flags

Returns all feature flags with optional per-user overrides from the `ff` cookie.

**Authentication**: None. This public endpoint supplies feature visibility before sign-in.

**Response**:

```json
{
  "flags": {
    "memberships": false
  },
  "overrides": {}
}
```

The `flags` field contains the merged result of global values + cookie overrides.
The `overrides` field contains only the parsed cookie overrides (for the admin UI).

Global feature flag writes use the Dynamic Config API namespace `feature-flags`:
`PATCH /api/v1/dynamic-config/namespaces/feature-flags`.

## Performance

| Endpoint                  | Round Trips | Caching | Notes                               |
| ------------------------- | ----------- | ------- | ----------------------------------- |
| GET /api/v1/feature-flags | 0           | None    | Flags are read from in-memory state |

## Related

- Service: [../../services/feature-flags/](../../../services/feature-flags/README.md)
- Dynamic Config API: [../dynamic-config/README.md](../dynamic-config/README.md)
- Parent: [../CLAUDE.md](../../CLAUDE.md)
