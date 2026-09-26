# Storybook A11y Exceptions

[Back to Tests and Checks](tests.md#storybook-a11y-exceptions)

`@storybook/addon-a11y` is enforced at `"error"` level for WCAG 2.0/2.1/2.2 A and AA where supported by the installed axe tags. Fix component semantics, keyboard behavior, and visual styles before considering a suppression. Components that need consumer context get that context from fixture props in a focused story, as described in the [Storybook authoring guidance](../../.agents/skills/storybook-authoring/SKILL.md#coverage-invariants).

### Pattern

1. **Fix the component when possible.** For example, make a scrollable viewport keyboard-focusable or increase text contrast instead of disabling the corresponding axe rule.

2. **Mark genuinely decorative content** with `aria-hidden="true"` in the component:

   ```tsx
   <kbd
     className='...'
     aria-hidden='true'
   >
     ⌥R
   </kbd>
   ```

3. **Only when the valid production behavior cannot satisfy axe**, add a narrowly scoped **dual-path** story-level suppression. Both `config.rules` and `options.rules` are required because Storybook's addon can merge parameters via either path:

   ```ts
   // Explain the concrete production constraint that prevents remediation.
   const constrainedStateA11y = {
     a11y: {
       config: { rules: [{ id: 'color-contrast', enabled: false }] },
       options: { rules: { 'color-contrast': { enabled: false } } },
     },
   } as const

   export const MyStory: Story = {
     parameters: constrainedStateA11y,
     render: () => <MyComponent />,
   }
   ```

4. Always include a comment above the suppression object explaining the concrete constraint and why a semantic or style fix is not appropriate.

`role="presentation"` is a semantic role, not an a11y suppression technique. Use `aria-hidden="true"` to hide decorative elements from the accessibility tree.
