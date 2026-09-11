Review accessibility. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.

- Check [Accessibility](../../../docs/requirements/navigation/ACCESSIBILITY.md) and WCAG 2.2 concerns in one user-facing flow, component family, or Storybook surface.
- Prioritize keyboard navigation, focus management, form labels/errors, dialog semantics, color contrast, and screen reader names.
- Use existing Playwright and Storybook coverage for expected behavior.
- Before pushing a changed component, run its Storybook axe check and the applicable Playwright
  route accessibility audit when those surfaces exist.
- Add or tighten tests for the selected accessibility behavior.
