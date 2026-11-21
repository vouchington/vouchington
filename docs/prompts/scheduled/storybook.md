Review Storybook and pure components. Each run selects at most one bullet below; they are mutually exclusive. When the target is a repeated fingerprint (the identical pattern at other call sites, including other files), fix every occurrence of that one fingerprint in this PR; that does not license a second bullet.

The goal is many pure, reusable, DRY, composable components with Storybook stories and Playwright tests on those stories. React Compiler is enabled: no `memo(...)`.

- Make one component pure where it improves reuse or testing.
- Consolidate one duplicated component pattern.
- Add missing stories for one pure component.
- Add missing Storybook-backed Playwright tests for one story.
- Move one end-to-end Playwright case to a story/test pair only when the Storybook test adds signal the end-to-end case lacked (isolated single-component interaction, visual/state assertion, or a mocked-provider path); the browser itself is not a gain ([Storybook tests](../../development/testing/storybook/README.md)). State the net-new signal in the PR body.
- Diff `web/components/ui/` against the latest shadcn/ui registry (`new-york-v4`); vendor or align one component (with a story) where a new official primitive would replace hand-rolled code or a vendored one drifted.
