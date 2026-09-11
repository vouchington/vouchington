# Dynamic Config

Runtime configuration is grouped into named Valkey `DynamicConfig` namespaces and managed through
one admin surface: `/admin/dynamic-config`.

Before moving env-backed runtime knobs into Dynamic Config, run `./dev/config-inventory` from the
repository root to review env readers, deployment contracts, package gates, and registry coverage.

## Namespaces

The registry lives in `@services/dynamic-config-admin` and currently includes feature flags, App
Attestation, vote weight, reCAPTCHA, Turnstile always-approve, post content limits, user rate limits, route rate limits, bloom
filters, RSS feed discoverability, RSS feed crawl scheduling, moderation, Bedrock batch tuning,
user import/export limits, Web Risk enablement, moderation AI controls, and agent response quotas.

Each namespace is registered with `defineDynamicConfigNamespace()` and defines:

- field schema and default values from its underlying `DynamicConfig`
- field metadata for every field, including descriptions and any min/max/integer constraints
- a `max_value` for every numeric field, or a documented `max_value_exemption` reason when no
  stable operator ceiling is appropriate
- namespace-specific validation for cross-field rules or ranges that metadata cannot express
- namespace authorization hooks for view and update permissions

The descriptor helper validates that the admin metadata keys exactly match the runtime
`DynamicConfig.fieldTypes` keys, so adding or removing a runtime field requires updating the
operator-facing metadata in the same place.

Administrators can view and update every namespace. Moderators, developers, customer-support staff,
and investors can view registered namespaces. Each namespace's `update_roles` grants narrower
write access, and every response exposes the resulting `can_update` value.
Security-sensitive controls such as App Attestation, reCAPTCHA, Turnstile always-approve, rate
limits, contribution limits, and Web Risk use empty update-role arrays so only administrators can
modify them.

Production `DynamicConfig` instances under `backend/services/**` must be registered in
`@services/dynamic-config-admin` so operators can inspect defaults, update runtime values, and
audit changes from one admin surface.

## History

Writes through `PATCH /api/v1/dynamic-config/namespaces/:namespace` record a
`dynamic_config_change_logs` row before changing Valkey. The admin UI shows the previous value, next
value, actor, and timestamp for each namespace.

No-op writes return `changed: false` and do not create history rows.

## Feature Flags

Feature flags are the `feature-flags` namespace. The legacy feature flag read endpoint remains:
`GET /api/v1/feature-flags` returns flags merged with browser-local overrides. Global writes and
history use the Dynamic Config API and UI.
Developers and administrators can update feature flags. Other Dynamic Config viewers receive a
read-only feature-flag surface.

Native device-local overrides are controlled independently from Dynamic Config CRUD. Their surface
reads `GET /api/v1/feature-flags`, persists only to the device, and never creates Dynamic Config
history or mutates the global namespace.

## Env Vars

Dynamic Config is for non-secret runtime behavior knobs. Credentials, deployment origins, ports,
build-time public IDs, and CI/test controls stay env-backed. The local development matrix lists env
vars that are good future Dynamic Config candidates: [local-env-vars.md](../../development/local-env-vars.md).

## Related

- [DynamicConfig test isolation](../../development/reference-dynamicconfig-cleanup.md)
- [backend/services/dynamic-config-admin/README.md](../../../backend/services/dynamic-config-admin/README.md)
- [backend/api/v1/dynamic-config/README.md](../../../backend/api/v1/dynamic-config/README.md)
- [Local environment variables](../../development/local-env-vars.md)
- [Feature flags](feature-flags.md)
- [Staging Turnstile always-approve](../../operations/staging-turnstile-always-approve.md)
