# @services/dynamic-config-admin

Central registry and service layer for Valkey-backed `DynamicConfig` namespaces.

## What It Does

- Registers every admin-editable DynamicConfig namespace in code.
- Enforces per-namespace view/update authorization through role arrays; administrators are always allowed.
- Validates field updates, records non-noop changes in `dynamic_config_change_logs`, and exposes recent history.

## Key Exports

| Module         | Functions                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `service.mts`  | `listDynamicConfigNamespaces`, `getDynamicConfigNamespace`, `updateDynamicConfigNamespace`, `listDynamicConfigNamespaceHistory` |
| `registry.mts` | `dynamicConfigRegistry`, `getDynamicConfigRegistryEntry`                                                                        |

## Adding A Namespace

Production configs under `backend/services/**` must be registered here. Add a
`defineDynamicConfigNamespace()` entry in `registry-entries.mts` with:

- a stable `namespace` that matches the underlying `DynamicConfig.key`
- a human label and description for the namespace list and detail panel
- an `access` object with view and update role arrays
- the owning service's `DynamicConfig` instance
- field metadata for every `DynamicConfig.fieldTypes` key, including a description and any
  min/max/integer constraints
- shared constants for numeric `min_value`/`max_value` bounds whenever the owning service validates
  or falls back from invalid values
- a `max_value` for every operator-exposed numeric field, or a documented `max_value_exemption`
  reason when no stable ceiling is appropriate
- namespace validation for cross-field rules or numeric ranges that metadata cannot fully express
- audit expectations covered through `updateDynamicConfigNamespace`
- docs in this README or the owning service README when behavior changes
- UI coverage through `/admin/dynamic-config` Playwright traversal and any needed component tests
- package dependencies for every imported config service
- DynamicConfig test isolation with `closeScopedDynamicConfigContext([config])` for tests that
  mutate shared config instances

The descriptor helper fails fast when a metadata key is missing or no longer exists in the runtime
`DynamicConfig.fieldTypes` map.

Before migrating env vars into Dynamic Config, run `./dev/config-inventory` from the repository
root and review the generated env readers, deployment contracts, docs, package gates, and registry
coverage.

## Related

- API route: [../../api/v1/dynamic-config/](../../api/v1/dynamic-config/README.md)
- Audit log: [../dynamic-config-audit/](../dynamic-config-audit/README.md)
- Valkey DynamicConfig: [../../data-stores/valkey/README.md](../../data-stores/valkey/README.md)
