// Redirect shim, not a duplicate: the fake-timer guard lives once at
// `test-helpers/vitest.setup.fake-timer-guard.mts` and is wired into every Vitest project via
// `vitest.config.mts`'s root-level `setupFiles`. That entry must be a literal relative path (no
// `resolve(process.cwd(), ...)`) so `no-mistakes`' static analyzer can trace the `vitest-setup`
// dependency edge instead of falling back to selecting every test — see
// docs/development/reference-explain-test-selection-and-vitest-ownership.md#traceable-vitest-setup-files.
// Vitest resolves setupFiles per-project against that project's own `root:`, and
// `web-storybook-browser` overrides `root: 'web'` (see
// test-helpers/vitest-config/storybook-browser-project.mts), so the same repo-root-relative
// literal that works for every other (default-root) project would resolve to a nonexistent path
// under `web/`. This file exists solely so that path resolves to something real; it must stay a
// one-line re-export with no logic of its own.
import '../../test-helpers/vitest.setup.fake-timer-guard.mts'
