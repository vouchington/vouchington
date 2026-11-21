Review React components in `web/**`. Find one concrete, bounded improvement that is safe to ship in one PR. If none qualifies, make no repository changes and report why only after the required audit below.

Unit: one route group under `web/app` or folder under `web/components`.

Load `react-rules` and `react-app-structure`.

- Initialize with `./dev/initialize monorepo`, then run `pnpm exec oxlint --type-aware --deny-warnings web` so the native React Compiler diagnostics run. A run that cannot do this is incomplete, not a no-op.
- Audit production compiler suppressions with `rg -n 'oxlint-disable.*react/' web`, comparing each rule against `.oxlintrc.react.json` and the source and tests; report the matches reviewed or that none exist. Do not add or broaden suppressions; remove one by expressing the data flow directly.
- Trace one asynchronous identity boundary end to end, starting at `web/app/(my)/my/data/use-data-request-stream.ts` and its tests: EventSource callbacks, REST completions, retry timers, and effect cleanup across `userId` or request-id changes. An old identity must not update current state. If resolved, pick another keyed async flow. Test the transition, not each identity alone.
- Use a native diagnostic (`react/purity`, `react/refs`, `react/set-state-in-effect`) to select one improvement. React Compiler is enabled: no `memo(...)`.
- Audit one RSC to `'use client'` boundary: only values crossing it enter the Flight payload. Reduce it to the smallest view model, projecting runtime fields explicitly (`Pick`/`Omit` do not remove them) and asserting the exact serialized keys. Do not use Context to avoid serialization.
- Guard exported server helpers used by Server Components against unguarded `headers()`, `cookies()`, or `draftMode()` at the source when no-request execution has a valid fallback.
- Prefer pure, DRY, prop-configurable components. React class components live in `'use client'` modules (`web-class-component-needs-use-client`).
- Tests follow [Test Value](../../development/tests.md#test-value-and-safe-reduction) and [Web Agent Rules](../../../web/AGENTS.md); add `data-pw` only for a real browser test. Validate compiler transformation with a `NEXT_TEST_BUILD=1` Next build, not Vitest identity assertions or Storybook.
