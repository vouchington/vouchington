# Storybook A11y Exceptions

[Back to Tests and Checks](tests.md#storybook-a11y-exceptions)

`@storybook/addon-a11y` is enforced at `"error"` level for WCAG 2.0/2.1/2.2 A and AA. Fix component semantics, keyboard behavior, and visual styles before considering a suppression. Components that need consumer context get it from fixture props in a focused story, as described in the [Storybook authoring guidance](../../.agents/skills/storybook-authoring/SKILL.md#coverage-invariants).

1. **Fix the component when possible.** Make a scrollable viewport keyboard-focusable or raise text contrast instead of disabling the axe rule.
2. **Mark genuinely decorative content** with `aria-hidden="true"`. `role="presentation"` is a semantic role, not a suppression technique.
3. **Only when valid production behavior cannot satisfy axe**, add a narrowly scoped story-level suppression. Declare it on both `config.rules` and `options.rules`, because Storybook's addon can merge parameters through either path, and put a comment above it explaining the concrete production constraint and why a semantic or style fix is not appropriate.
