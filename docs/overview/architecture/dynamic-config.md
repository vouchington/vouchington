# Dynamic Config

Dynamic Config separates runtime value storage from the product policy that governs configuration.
The `valkyries` package owns reusable registry and validation primitives, while the admin service
composes them with the application's product namespaces and authorization rules.

The admin service remains responsible for the operator workflow: selecting registered product
configuration, checking the caller's permission, validating product-specific relationships,
normalizing updates, recording audit history, and applying writes. Keeping that orchestration in the
application preserves its authorization and audit boundaries while allowing generic registry
behavior to be shared.

Environment variables remain appropriate for credentials, deployment origins, ports, build-time
public identifiers, and test controls. Dynamic Config is intended for runtime behavior that can be
changed without redeploying. The [local environment variable guide](../../development/local-env-vars.md)
helps identify candidates for that boundary.

Before changing environment-variable or Dynamic Config usage, run the
[`./dev/config-inventory`](../../overview/infrastructure/environment-variables.md) command to review the
repository's current configuration inventory.

## Related

- [DynamicConfig test isolation](../../development/reference-dynamicconfig-cleanup.md)
- [Services architecture](services/README.md)
- [Feature flags](feature-flags.md)
