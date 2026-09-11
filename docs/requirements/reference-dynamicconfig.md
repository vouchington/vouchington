# `dynamic_config`

[Back to Admin Navigation Matrix reference](reference-admin-navigation-matrix-table-b-entity-action-description.md)

| Action               | Description                                              | Route                   | File path                               | Navigation path(s)                                             |
| -------------------- | -------------------------------------------------------- | ----------------------- | --------------------------------------- | -------------------------------------------------------------- |
| List / Update        | View dynamic config namespaces and update fields.        | `/admin/dynamic-config` | `web/app/admin/dynamic-config/page.tsx` | sidebar: Engineering → Dynamic Config; command: Dynamic Config |
| View History         | Inspect per-namespace changes with actor and timestamps. | `/admin/dynamic-config` | `web/app/admin/dynamic-config/page.tsx` | sidebar: Engineering → Dynamic Config; command: Dynamic Config |
| Set Browser Override | Override feature flags in the browser cookie.            | `/admin/dynamic-config` | `web/app/admin/dynamic-config/page.tsx` | sidebar: Engineering → Dynamic Config; command: Dynamic Config |

Swift and .NET device-local overrides are separate native-only Engineering → Device Feature Flags
entries; they do not reuse or advertise the web Dynamic Config route.
