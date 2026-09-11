# DynamicConfig Cleanup

[Back to Vitest Projects](reference-tests-vitest-projects.md#dynamicconfig-cleanup)

Behavior tests must use `overrideDynamicConfigFieldsForTest()` from
`@voucha/test-helpers/dynamic-config` for temporary singleton values. It changes only the worker-local
field map; `setField()` and `setFields()` write and publish through the shared Valkey hash and can
pollute parallel files. The backend worker setup snapshots all registered configs before each test
and restores the exact prior maps afterward, including the non-production test baseline that disables
rate limits and raises their thresholds. Never restore singleton tests to `defaultFields`: production
defaults are not the test baseline.

Tests that deliberately verify persistence, validation, or pub/sub behavior must create a throwaway
config with `createDynamicConfigTestKey()` and call `closeTestDynamicConfigContext()` afterward. When
a test opens a stable config context directly, pass every touched instance to
`closeScopedDynamicConfigContext([config])` in cleanup.
Direct singleton mutation (`setField()`, `setFields()`, or `fields.*`) is blocked in backend tests by
`backend-no-direct-dynamic-config-test-mutation`; the focused helper test is the only path exception.
