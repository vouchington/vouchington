Review feature flags. Pick at most one concrete, bounded improvement that is safe to ship in one PR.

Unit: one flag.

- Load `feature-rollout`. Check [Feature Flags](../../overview/architecture/feature-flags.md) and [Dynamic Config](../../overview/architecture/dynamic-config.md) against one flag definition, read path, admin update path, or cookie override: consistency across definition, admin UI, readers, and override parsing, and safe defaults when dynamic config is unavailable.
- Flags gate frontend visibility only; never gate an API endpoint, so clients keep stable contracts.
- Follow [One current contract](../../../AGENTS.md): no flag without a consumer; remove a flag whose purpose has ended unless an open issue tracks keeping it.
