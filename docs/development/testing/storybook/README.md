# Storybook

Source entrypoint: [web/storybook/README.md](../../../../web/storybook/README.md). Authoring rules are in [AGENTS.md](../../../../web/storybook/AGENTS.md) and the [Storybook authoring skill](../../../../.agents/skills/storybook-authoring/SKILL.md).

## Component story coverage

`component-story-coverage.test.ts` requires every runtime PascalCase named export (and any runtime default export) of a `web/components/**/*.tsx` file containing `data-pw` to be directly reachable from a story. That includes PascalCase runtime values such as enums, so it can require a story for an export that is not a React component. The exclusions file stays empty. Incomplete module facts fail the check rather than silently shrinking its inventory.

## Troubleshooting

- **Browser startup failures** (`Vitest failed to find the runner`, `Failed to connect to the browser session`) are pre-test Vitest/Chromium handshake races, not story failures. `ci/storybook-browser-runner.mts` owns one session budget across bounded whole-process retries, and its diagnostics artifact records the furthest proven bootstrap stage. Describe the repository fix as bounded recycling around an opaque dependency bootstrap failure, not as a fix for the dependency defect. See [CI transient-failure classification](../../reference-ci-classifying-transient-infrastructure-failures.md).
- **`optimized dependencies changed. reloading`** means Vite discovered a package after the first optimize pass and aborted in-flight fetches; add it to `storybookBrowserOptimizeDeps`.
- **`next/image` namespace errors** mean the browser-mode alias is not scoped to the `web-storybook-browser` project, so it would leak into the published Storybook build.
- **`React.use is not a function`** means a server component leaked into a story; alias it to a stub under `web/storybook/mocks/`.
- **`userEvent.tab()` leaves focus before an `inert` subtree.** `storybook/test` bundles Testing Library's synthetic tab-order calculation, which can pick a focusable descendant of an inert ancestor that Chromium refuses to focus. When a story must verify real sequential keyboard navigation, use `vitest/browser` `userEvent.tab()` while `globalThis.__vitest_browser__` is present (the Playwright provider sends a native Tab). Keep an explicit-focus fallback so the story still runs in published Storybook, do not count the fallback as Tab-order coverage, and remove the workaround when testing-library/user-event#1215 or storybookjs/storybook#27138 land.
