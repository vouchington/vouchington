Review Storybook and pure components. Every run selects exactly one bullet below — the bullets are mutually exclusive, not a checklist to clear in the same PR. When that one bullet's target is a repeated fingerprint (the identical duplicated pattern recurring at other call sites, including in other files), fix every occurrence of that one fingerprint in this PR — this does not license picking a second, unrelated bullet.

Our goal is to have as many pure, reusable components as possible, set up Storybook stories on them, and Playwright tests on those stories. React Compiler is enabled, so do not add `memo(...)` for re-render prevention. We want our components to be pure for performance and reusability, keep them DRY, and make them composable.

- Make one component pure where it improves reuse or testing.
- Consolidate one duplicated component pattern.
- Add missing stories for one pure component.
- Add missing Storybook-backed Playwright tests for one story.
- Move one suitable Playwright end-to-end case to a Storybook story/test pair — only when the Storybook-backed test exercises signal the end-to-end case did not (e.g. an isolated single-component interaction, a visual/state assertion, or a mocked-provider path the full-page end-to-end case bypassed), not as a pure relocation. Storybook's browser project also runs on Playwright Chromium (see [web/storybook/CLAUDE.md](../../../web/storybook/CLAUDE.md)), so the gain must be isolation or a mocked path, not "runs in a real browser." State the net-new signal gained in the PR body.
- Diff `web/components/ui/` against the latest shadcn/ui registry (`new-york-v4`). Flag one place where a new official primitive (e.g. `radio-group`, `sonner`, `spinner`, `kbd`) would replace hand-rolled custom code, or where a vendored primitive has drifted from upstream — then vendor/align that one component (with a story) instead of letting custom workarounds accrete.
