# @services/feature-flags

Valkey-backed feature flag system with per-user cookie overrides.

Current boolean flags: `memberships`, `membershipStripeBilling`, `membershipAppleBilling`,
`membershipGoogleBilling`, `membershipMicrosoftBilling`, `chat`, `combinedSearch`,
`support`, and `fediverse`. Flags gate frontend visibility only; backend API endpoints remain
mounted. The separate `membership-billing` Dynamic Config gates new provider purchase intents;
evidence ingestion and existing membership lifecycle work remain active.

Cookie parsing and encoding use the compatibility facade in
[`@ts-shared/feature-flags`](../../../ts-shared/feature-flags/index.mts), which delegates generic
mechanics to `@vouchington/utils/feature-flags` while retaining Voucha's `ff` cookie contract. This
service supplies the Node.js `Buffer` base64 codec, applies `FEATURE_FLAG_COOKIE_MAX_LENGTH` before
decode/parse (default `4096`), filters overrides to known flags, and preserves the backend public
exports.

## Key exports

- `getFeatureFlags()` — returns current flag values
- `getFeatureFlagsWithOverrides(overrides: FeatureFlags)` — merges stored flags with cookie-based overrides
- `parseFeatureFlagCookie(cookieValue)` — decodes a feature flag override cookie
- `encodeFeatureFlagCookie(overrides: FeatureFlags)` — encodes flags into a cookie string
- `FeatureFlags` — TypeScript type for the flag map

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- Shared cookie primitives: [../../../ts-shared/feature-flags/index.mts](../../../ts-shared/feature-flags/index.mts)
- [backend/api/v1/feature-flags/README.md](../../api/v1/feature-flags/README.md)
- [backend/api/v1/dynamic-config/README.md](../../api/v1/dynamic-config/README.md)
- [docs/overview/architecture/feature-flags.md](../../../docs/overview/architecture/feature-flags.md)
