// Redirect shim, not a duplicate: `web-storybook-browser`'s `setupFiles` literal (declared in
// test-helpers/vitest-config/storybook-browser-project.mts) must be a plain relative path (no
// `resolve(process.cwd(), ...)`) so `no-mistakes`' static analyzer can trace the `vitest-setup`
// dependency edge instead of falling back to a global full-suite selection — see
// docs/development/ci.md. `no-mistakes` resolves that literal relative to the repo root
// (test-helpers/vitest.setup.storybook-browser-guard.mts), but Vitest resolves the same literal
// relative to this project's own `root: 'web'` override, landing here instead. This file exists
// solely so that path resolves to something real; it must stay a one-line re-export with no logic
// of its own.
import '../.storybook/vitest.setup.ts'
