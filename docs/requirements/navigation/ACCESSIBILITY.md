# Accessibility Requirements

## Target Level

WCAG 2.2 AA compliance. Tooling should include WCAG 2.2 tags where the underlying scanner supports
them, while retaining WCAG 2.0 and 2.1 A/AA checks.

## Semantic HTML

- Use semantic elements (`<nav>`, `<main>`, `<article>`, `<section>`, `<aside>`, `<header>`, `<footer>`) instead of generic `<div>` containers where appropriate.
- Every page must have exactly one `<h1>`. Heading levels must not skip (e.g., `<h1>` → `<h3>`).
- Use `<button>` for actions and `<a>` for navigation. Never use `<div>` or `<span>` as interactive elements.

## Forms

- Every form input must have an associated `<Label>` (via `htmlFor` or wrapping).
- Required fields must use the `required` attribute or `aria-required="true"`.
- Validation errors must be announced to screen readers (via `aria-describedby` or `aria-live`).
- Use shadcn/ui form components (`<Input>`, `<Label>`, `<Select>`, `<Textarea>`) which handle accessibility attributes.
- Helper text adjacent to a checkbox or radio control must sit inside the same `<label>` as the control so that the full visible row (including description text and padding area) is a single click/tap target — meeting the ≥ 44×44px touch-target requirement. See [Checkbox and radio rows](./reference-components-page-layout-primitives.md#checkbox--radio-rows).

## Motion Preferences

- All CSS animations and transitions must respect `prefers-reduced-motion: reduce`.
- `globals.css` contains a global `@media (prefers-reduced-motion: reduce)` block that disables animations site-wide.
- Do not add inline animations that bypass this global guard.

## Images

- User-uploaded images must have meaningful `alt` text. Use the post title as fallback.
- When a visible caption appears below the image, mark the image decorative to avoid repetition:
  ```tsx
  alt={image.caption ? '' : (post.title || `Untitled ${humanizePostType(post.post_type)}`)}
  ```
- When no caption is shown alongside the image, prefer the caption text; fall back to title:
  ```tsx
  alt={image.caption || post.title || `Untitled ${humanizePostType(post.post_type)}`}
  ```
- Decorative images and icons use `alt=""` to be hidden from screen readers.
- The `<Image>` component from Next.js requires `alt` — always provide a meaningful value.

## Keyboard Navigation

- All interactive elements must be focusable and operable via keyboard.
- Focus order must follow a logical reading sequence.
- Custom components must support expected key interactions: Enter/Space for activation, Escape for dismissal, Arrow keys for navigation within groups.
- Tooltip triggers must be real interactive elements such as buttons. Do not make plain text or wrapper `<span>` elements focusable with `tabIndex` just to show a tooltip.
- If an unavailable control still needs a tooltip explanation, keep the trigger keyboard-focusable with a `Button` that uses `aria-disabled="true"` and suppresses activation instead of wrapping a disabled control in a focusable non-interactive element.
- Shared scroll regions must make their viewport keyboard-focusable and show a visible inset focus indicator. Use the shared `ScrollArea`, which provides this invariant for every orientation.
- Use Radix UI / shadcn components which handle keyboard interactions out of the box.

## Dialogs

- Every `DialogContent` must include a `DialogDescription` child (visible or `className='sr-only'`).
- Every `AlertDialogContent` must include an `AlertDialogDescription` child (visible or `className='sr-only'`).
- If a dialog genuinely needs a custom `aria-describedby` target or no description, add an inline `ast-grep-ignore: web-dialog-content-description` with the reason.
- `web-dialog-content-description` enforces this policy for production TSX.

## WCAG 2.2 Additions

- Focus indicators must remain visible and not be hidden behind sticky headers, sidebars, drawers, cookie banners, or modal chrome.
- Mobile-visible action controls must meet the target-size rules in [MOBILE.md](MOBILE.md).
- Dragging interactions need a pointer or keyboard alternative.
- Authentication and re-authentication flows must not rely on memory puzzles, transcription, or solving cognitive tests.
- Forms that ask for the same information more than once in a flow must support autocomplete or preserve already-entered values.

## Screen Reader Support

- Use `aria-label` or `aria-labelledby` for elements without visible text labels.
- Use `sr-only` class for visually hidden but screen-reader-accessible text.
- Dynamic content updates must use `aria-live` regions (Sonner toast handles this internally).
- Skip link is provided in the root layout for keyboard users to bypass navigation.
- Non-modal persistent bars (cookie consent, announcements) must use `role='region'` with
  `aria-label`, not `role='dialog'`. Dialog role implies focus management; region is correct
  for content that does not trap focus or block page interaction.

## Testing

- Static analysis: 30+ `jsx-a11y` rules enforced via oxlint at `error` level.
- Runtime testing: `@axe-core/playwright` scans key public, authenticated, and admin pages for WCAG 2.0/2.1/2.2 A/AA violations and fails on every unwaived violation.
- Storybook testing: `@storybook/addon-a11y` fails story-level WCAG 2.0/2.1/2.2 A/AA violations during the browser-mode Storybook Vitest suite.
- Run `pnpm exec playwright test --grep a11y` for page audits and `VITEST_STORYBOOK_BROWSER=1 pnpm exec vitest run --project web-storybook-browser` for Storybook audits.

## Related

- [Web rules](../../../web/CLAUDE.md) — UI, routing, and client conventions
- [Backend rules](../../../backend/CLAUDE.md) — service, API, and data conventions

- [Components](COMPONENTS.md) — UI component patterns and guidelines
- [SEO](../seo/SEO.md) — Search engine optimization requirements
