# Test Helpers

Shared Vitest tooling consumed by [vitest.config.mts](../vitest.config.mts): project wiring,
aliases, setup files, the fake-timer guard, and fork-leak detection. Not a feature workspace — this
is the infrastructure other workspaces' tests run on.

Before adding or changing a Vitest test, fixture, or mock here, load the
[vitest-test-authoring skill](../.agents/skills/vitest-test-authoring/SKILL.md).
