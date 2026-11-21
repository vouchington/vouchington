Review loading states and rendering strategy in `web/**`. Pick at most one concrete, bounded improvement that is safe to ship in one PR.

- Every list-route group whose pages and sub-routes never call `notFound()` or `redirect()` needs a `loading.tsx` skeleton. Never add one to a segment or ancestor whose descendants call them: streaming commits HTTP 200 first.
- Skeleton components need Storybook stories; add `data-pw` only for a real Playwright consumer ([Test Value and Safe Reduction](../../development/reference-tests-value-and-reduction.md)).
- Stacked async RSC children use `SequentialSuspense` or `SequentialAsideSuspense`, never sibling `<Suspense>` boundaries.
- Logged-out users get fully SSR'd pages; streaming is for logged-in supplementary content only. Main content is awaited, not streamed.
