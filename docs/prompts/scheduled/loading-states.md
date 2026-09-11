Review loading states and rendering strategy in `web/**`. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.

- Every list-route group whose pages (and all sub-routes) never call `notFound()` or `redirect()` must have a `loading.tsx` rendering a skeleton. Never add `loading.tsx` to a segment (or ancestor group) whose descendants call `notFound()` or `redirect()` — streaming commits HTTP 200 before either can fire.
- Skeleton components must have Storybook stories. Add `data-pw` only for a real behavioral Playwright consumer; follow [Test Value and Safe Reduction](../../development/reference-tests-value-and-reduction.md).
- Multiple vertically-stacked async RSC children must use `SequentialSuspense` or `SequentialAsideSuspense` — never sibling `<Suspense>` boundaries.
- Logged-out users get fully SSR'd pages (no streaming). Streaming is for logged-in supplementary content only.
- Main content (lists, detail views, headers) must be awaited, not streamed.
- Prefer a fix that adds a missing loading.tsx, skeleton, or Storybook story, or removes an unconsumed skeleton `data-pw`.
