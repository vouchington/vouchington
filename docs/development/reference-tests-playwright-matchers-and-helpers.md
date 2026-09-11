# Playwright Matchers and Helpers

[Back to Tests and Checks](tests.md#playwright-matchers-and-helpers)

Playwright reliability patterns for mutation-completion waits, async RSS import route mocks,
discoverable passkey route mocking, and scoped Radix Select option locators live in
[playwright/README.md](../../playwright/README.md). Helper exports are listed in
[playwright/helpers/README.md](../../playwright/helpers/README.md).

### Deterministic test preconditions

Use `requireTestValue(value, message)` from `playwright/helpers/assertions.mts` when a fixture,
response, attribute, or layout box must exist for the scenario to be valid. It preserves falsy
values such as `0`, `false`, and the empty string, but fails immediately for `null` or `undefined`
with the supplied diagnostic. Prefer it to conditionally skipping the interaction or assertion.

For sidebar-sensitive tests, use `ensureSidebarOpen(page)` from
`playwright/helpers/layout-collapse.mts`. It normalizes the current persisted sidebar state,
asserts the expanded invariant, and returns the sidebar locator for the test's behavioral checks.
Tests should still seed their own product state and assert the intended user-visible outcome;
these helpers express prerequisites rather than hiding optional behavior.

Infinite-scroll specs should assert `infinite-scroll-sentinel` /
`paginated-list-continuation` and count `post-card-root` (or the list's own
`data-pw`) instead of CSS class locators such as `.animate-spin` or
`[class*="space-y"] > article`. The footer is a Load more control, not a
spinner. Signed-out hostname vote widgets expose `hostname-vouch-disavow-vote`
and `hostname-vouch-disavow-vote-sign-in`; there is no
`hostname-vouch-disavow-vote-trigger` test id. Web search snippet
assertions query the seeded crawl-chunk token `pwwebsearchsnippet`
because URL-only matches render no `web-search-result-snippet`.
The crawl containing that token must also satisfy the web-search row predicates and
the UUIDv7 recency boundary (`crawls.id >= getMinUUIDv7ForDate(new Date(Date.now() -
30 * 24 * 60 * 60 * 1000))`); `assertPlaywrightSeedData()` checks both before browser
tests run. Seed crawl IDs use the start of the guarded `now - 12h` UTC day so the
fixture stays stable across midnight without becoming stale at a 31-day-month end.
Global setup pins that anchor in the environment before seeding; Playwright workers
inherit it so a run crossing the daily noon rollover still references the inserted IDs.

### `toBeAttached()` vs `toBeVisible()`

- **`toBeAttached()`** — asserts the element is present in the DOM tree (attached to the document), regardless of CSS `display`, `visibility`, `opacity`, or `transform`. Use when testing that a component is mounted or unmounted (e.g. a portal removed from the DOM on dismiss, or a honeypot input that must exist but be visually hidden).
- **`toBeVisible()`** — additionally checks that the element and all its ancestors are visible (non-zero size, not `display:none`, not `visibility:hidden`, etc.). Use when you need to confirm the user can actually see the element.

For Radix portaled content (Select options, tooltips, dialogs), prefer `toBeAttached()` when asserting the open state immediately after triggering, because the CSS animation may not have settled yet. Once the animation completes or you have interacted with the content, `toBeVisible()` is appropriate.

### Opening Radix dropdowns in keyboard-nav tests

Use `openRadixDropdown(trigger)` from `playwright/helpers/radix-select.mts`. It presses Space on the trigger (the reliable cross-primitive keyboard activation path) and documents the `toBeAttached()` guard pattern for the follow-up option assertion.
