# @services/dynamic-config-audit

Source entrypoint: [backend/services/dynamic-config-audit/README.md](../../../../../backend/services/dynamic-config-audit/README.md)

Provides audit trail recording for dynamic configuration changes made by administrators.

## What It Does

Records every change to a Valkey-backed `DynamicConfig` instance into the `dynamic_configuration_revisions`
Postgres table, enabling full change history with who changed what and when.

## Data Model

- **dynamic_configuration_revisions** — append-only audit log. Each row captures the `configuration_key`
  (Valkey DynamicConfig key), the `changed_by_id` (administrator user ID, SET NULL on deletion),
  and snapshots of `previous_fields` and `next_fields` as JSONB.

## Key Functions

| Module       | Functions                   |
| ------------ | --------------------------- |
| `record.mts` | `recordDynamicConfigChange` |

## Usage

Call `recordDynamicConfigChange` before `setFields` when adding a service-level update path for a
`DynamicConfig` instance. Admin HTTP writes should go through `@services/dynamic-config-admin`,
which records audit rows automatically.

```ts
import { recordDynamicConfigChange } from '@services/dynamic-config-audit'

const previous = { ...config.getFields() }
await recordDynamicConfigChange(currentUser.id, CONFIG_KEY, previous, validatedChanges)
await config.setFields(validatedChanges)
```

## Related

- API route: [../../api/v1/dynamic-config/README.md](../../../../requirements/api/v1/dynamic-config/README.md)
- Admin service: [../dynamic-config-admin/README.md](../dynamic-config-admin/README.md)
- Valkey DynamicConfig: [../../data-stores/valkey/README.md](../../../../development/valkey/README.md)
- Services guide: [../AGENTS.md](../../../../../backend/services/AGENTS.md)
