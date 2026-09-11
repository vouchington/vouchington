Review feature flags. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.

- Check [Feature Flags](../../../docs/overview/architecture/feature-flags.md) and [Dynamic Config](../../../docs/overview/architecture/dynamic-config.md) against one flag definition, read path, admin update path, or cookie override.
- Prioritize consistency between flag definition, admin UI, reader helpers, and cookie/override parsing, plus safe defaults when dynamic config is unavailable.
- Feature flags gate frontend visibility only — never use a flag to disable, hide, or gate access to an API endpoint; backend APIs stay mounted regardless of flag state so clients keep stable contracts.
- Do not add a flag without a consumer; remove flags whose rollout is complete, unless an open issue tracks the reason to keep it.
- Skip findings already covered by open issues or open PRs.
- Add or tighten tests for the selected flag definition, reader, or override behavior.
