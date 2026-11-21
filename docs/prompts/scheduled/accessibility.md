Review accessibility. Pick at most one concrete, bounded improvement that is safe to ship in one PR.

Unit: one user-facing flow or component family.

- Check [Accessibility](../../requirements/navigation/ACCESSIBILITY.md) and WCAG 2.2 in one user-facing flow, component family, or Storybook surface: keyboard, focus, form labels/errors, dialog semantics, contrast, screen reader names.
- Before pushing a changed component, run its Storybook axe check and the applicable Playwright route accessibility audit.
