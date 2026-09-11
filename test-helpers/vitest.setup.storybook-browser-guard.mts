// Redirect shim, not a duplicate: this entry exists only so `no-mistakes`' static analyzer can
// resolve `web-storybook-browser`'s `setupFiles` literal (declared in
// test-helpers/vitest-config/storybook-browser-project.mts) to a real repo-root file — no-mistakes
// always resolves that literal relative to the repo root regardless of which file declares it. See
// docs/development/ci.md. Vitest itself never loads this copy: it resolves the same literal
// relative to that project's own `root: 'web'` override, landing on
// web/test-helpers/vitest.setup.storybook-browser-guard.mts instead (see that file). Both copies
// must stay a one-line re-export with no logic of their own.
import '../web/.storybook/vitest.setup.ts'
