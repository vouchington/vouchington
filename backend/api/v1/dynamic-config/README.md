# Dynamic Config API

Admin runtime configuration endpoints backed by Valkey `DynamicConfig` namespaces.

## Endpoints

| Method | Route                                                  | Authentication                    | Description                         |
| ------ | ------------------------------------------------------ | --------------------------------- | ----------------------------------- |
| GET    | `/api/v1/dynamic-config/namespaces`                    | Required + namespace grants       | List visible namespaces             |
| GET    | `/api/v1/dynamic-config/namespaces/:namespace`         | Required + namespace view grant   | Read one namespace and field schema |
| PATCH  | `/api/v1/dynamic-config/namespaces/:namespace`         | Required + namespace update grant | Update fields in one namespace      |
| GET    | `/api/v1/dynamic-config/namespaces/:namespace/history` | Required + namespace view grant   | Read recent namespace change logs   |

## Authorization

Administrators can view and update every namespace. The common viewer roles are `moderator`,
`developer` and `investor`. Namespace entries define `update_roles`; response
objects expose `can_update` so clients can render the correct read-only or editable surface.

## PATCH Body

```json
{
  "config": {
    "enabled": true
  }
}
```

Updates are validated against the namespace field schema and optional namespace-specific rules.
No-op updates return `changed: false` and do not create audit rows.

## History

History comes from `dynamic_config_change_logs` and includes previous values, next values,
changed fields, who changed them, and when.

## Performance

| Endpoint                                                 | Round Trips | Caching | Notes                                          |
| -------------------------------------------------------- | ----------- | ------- | ---------------------------------------------- |
| GET /api/v1/dynamic-config/namespaces                    | 1           | None    | In-memory registry plus auth                   |
| GET /api/v1/dynamic-config/namespaces/:namespace         | 1           | None    | In-memory config read                          |
| PATCH /api/v1/dynamic-config/namespaces/:namespace       | 2           | None    | Audit insert plus Valkey write when changed    |
| GET /api/v1/dynamic-config/namespaces/:namespace/history | 1           | None    | Postgres query limited to latest 50 audit rows |

## Related

- Service: [../../../services/dynamic-config-admin/README.md](../../../services/dynamic-config-admin/README.md)
- Audit: [../../../services/dynamic-config-audit/README.md](../../../services/dynamic-config-audit/README.md)
- Parent: [../../CLAUDE.md](../../CLAUDE.md)
