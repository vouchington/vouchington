# Voucha Web

Next.js app-router frontend for Voucha. The Cloudflare Worker is the public entry point in both development and production; this app handles the page rendering layer.

## Source Of Truth

- Routes and page requirements: [docs/requirements/navigation/ROUTES.md](../docs/requirements/navigation/ROUTES.md)
- SEO and indexability: [docs/requirements/seo/SEO.md](../docs/requirements/seo/SEO.md)
- Dynamic rendering: [docs/requirements/navigation/DYNAMIC-RENDERING.md](../docs/requirements/navigation/DYNAMIC-RENDERING.md)
- Components and design-system usage: [docs/requirements/navigation/COMPONENTS.md](../docs/requirements/navigation/COMPONENTS.md)
- Accessibility: [docs/requirements/navigation/ACCESSIBILITY.md](../docs/requirements/navigation/ACCESSIBILITY.md)
- Preferences and local state: [docs/requirements/users/PREFERENCES.md](../docs/requirements/users/PREFERENCES.md)
- Caching architecture: [docs/overview/architecture/caching-strategy.md](../docs/overview/architecture/caching-strategy.md)
- Aside inventory and page mappings: [docs/requirements/navigation/ASIDES.md](../docs/requirements/navigation/ASIDES.md)
- Signed-out user action buttons (vote/follow/hide): [docs/requirements/navigation/SIGNED_OUT_ACTIONS.md](../docs/requirements/navigation/SIGNED_OUT_ACTIONS.md)
- Mobile touch targets, shared filters, admin/settings layout primitives, and post preview semantics: [docs/requirements/navigation/COMPONENTS.md](../docs/requirements/navigation/COMPONENTS.md) and [docs/requirements/navigation/MOBILE.md](../docs/requirements/navigation/MOBILE.md)

## Aside Sidebar Dimensions

- **Desktop**: `w-[334px] min-w-[334px]` right sidebar (334px = 300px card content + 32px `p-4` padding + 2px border).
- **Mobile non-infinite scroll**: full-width aside below main content (`w-full`, `flex-col lg:flex-row` container).
- **Mobile infinite scroll**: `hidden lg:block` inline aside + `AsideDrawer` toggle/Sheet for access.
- **No aside content**: `AsideColumn` returns null — main content is horizontally centered.
- **Keyboard shortcut**: `Cmd/Ctrl + \` toggles the right aside. On desktop it collapses the column; on mobile it opens/closes the Sheet drawer. Shortcut is registered in [`web/lib/aside-context.tsx`](lib/aside-context.tsx) and listed in [`web/lib/keyboard-shortcuts.ts`](lib/keyboard-shortcuts.ts).
- **Toggle button positioning**: `AsideDrawer` renders the button in a `sticky top-14 pointer-events-none` row so its hit target stays clear of the page content.

## Key Public Routes

- `/sources` - feed-first RSS directory with topic and domain actions
- `/domains` - public domain directory
- `/domain/:idOrHostname` - public domain detail page with top URLs and linked feeds
- `/:topicType/:slug` - topic detail pages that aggregate descendant sources and domains

## Development

Run from the repo root:

```bash
cd web
pnpm run dev
```

In local development you normally access the app through the Cloudflare Worker entry point rather than the raw Next.js port.
The web dev script also starts Storybook and Next.js proxies it at `/storybook/` on the local Next origin. Entity Storybook stories live in [`web/storybook/entities/`](storybook/entities/) and render production leaf components with static fixtures. They may use the local Storybook provider wrapper for auth, preferences, votes, tooltips, and asides, but they must not mount app route files, server components, database-backed calls, or live API calls.
Storybook includes the accessibility addon, and browser-mode Storybook checks fail on WCAG 2.0/2.1 A/AA axe violations. Keep shared axe/a11y configuration in [`web/.storybook/preview.tsx`](.storybook/preview.tsx), prefer default checks, and document any story-local exception next to the story.

Pure client components should stay configurable and covered by both Vitest and Storybook. React
Compiler supplies routine memoization, so do not add `memo(...)` solely for referential stability
or re-render prevention. Keep manual memoization only when identity is semantic or the work is
measurably expensive. Use production `data-pw` attributes only for selectors exercised by
Playwright; component tests should prefer roles/text or local test stubs for unit-only structure.

## Hydration Safety

Client components must not call non-deterministic values (`Date.now()`, `Math.random()`, locale
formatters) during the initial render — the server and client produce different output, causing
React's hydration mismatch error. Use `useState<T | null>(null)` + `useEffect` to compute the
live value after mount and render a deterministic prop-derived fallback in the meantime.

Visible counts should use the shared locale-aware format helpers and the resolved UI locale from
the app provider/server helper. Do not format count labels with browser-only locale detection
during SSR.

Relative-time displays under 60 seconds must show **"just now"** to eliminate per-second clock
drift. See [`web/components/shared/time-ago.tsx`](components/shared/time-ago.tsx) for the canonical implementation.

## Architecture Notes

- Public pages use the shared SEO helpers in [`web/lib/seo/`](lib/seo/).
- Server components call the backend through [`web/lib/api/server/`](lib/api/server/).
- Personalized social proof should stay in React Server Components and stream only for authenticated users.
- Topic, post, and RSS item follow-context modules are auth-only server components that fetch their own data and render `null` for logged-out viewers or when there are no followed-user matches to show.
- Auth-only and admin-only **client** components inside public shells - especially navbar controls, sidebar sections, and admin panels - must be imported with `next/dynamic` so the public bundle does not pull in hidden client code. Never use `next/dynamic` on server components (they don't ship JS to the browser).
- RSS item detail is opened as a query-param modal (`rss_item`, `rss_item_nav`) from news/feed lists so previous/next navigation follows the visible list order through a bounded URL window. Top-level visible cards are included, expanded story-member cards are included, and collapsed or hidden story members are excluded.
  - **News item cards**: the source name is shown exactly once, as a badge next to the published date. Category chips render separately when present. There is no duplicate "source topic chip".
  - **Modal metadata**: the modal mirrors the card — source badge and published date are shown in the same layout at the top, followed by category chips, then the full article body.
  - **Modal scroll**: long articles scroll inside the modal. The `DialogContent` uses a CSS grid layout (`grid-rows-[auto_minmax(0,1fr)_auto]`) so the Radix `ScrollArea` viewport gets a definite height and can scroll overflowing content.
  - **Previous/Next focus**: clicking or using arrow keys to navigate moves DOM focus to the corresponding button, so the focus-visible ring reflects the direction the user just pressed.
- Public sources and domains routes are indexable; admin, auth, and workflow routes are not.

## See Also

- App structure: [app/README.md](app/README.md)
- Component catalog: [components/README.md](components/README.md)
- Vote components: [components/votes/README.md](components/votes/README.md)
- Shared library catalog: [lib/README.md](lib/README.md)
- Error handling helpers: [lib/on-error/README.md](lib/on-error/README.md)
- API-response test helpers: [test-helpers/api-responses/README.md](test-helpers/api-responses/README.md)
- Storybook: [CLAUDE.md](storybook/CLAUDE.md) / [README.md](storybook/README.md)
- Entity link helpers: [CLAUDE.md](lib/links/CLAUDE.md) / [README.md](lib/links/README.md)
- Route factories: [lib/routes/CLAUDE.md](lib/routes/CLAUDE.md)
- Entity anatomy (fields, states, surfaces): [anatomy/README.md](../docs/requirements/anatomy/README.md)
- Content safety: [content-rendering.md](../docs/overview/architecture/content-rendering.md)
- Expanded web agent rules: [web-agent-rules.md](../docs/development/web-agent-rules.md)
- Entity × action cross-cut matrix: [ENTITY-ACTION-MATRIX.md](../docs/requirements/ENTITY-ACTION-MATRIX.md)
- Entity × lifecycle flow matrix: [ENTITY-LIFECYCLE-MATRIX.md](../docs/requirements/ENTITY-LIFECYCLE-MATRIX.md)
- Error handling: [error-handling.md](../docs/overview/architecture/error-handling.md)
- Currency-aware integer money contract: [monetary-values.md](../docs/overview/architecture/monetary-values.md)
- Post requirements: [POSTS.md](../docs/requirements/content/POSTS.md)
- Intent-based navigation (vocabulary, taxonomy, resolver): [NAVIGATION.md](../docs/requirements/navigation/NAVIGATION.md)

## Related

- [Requirements](../docs/requirements/README.md) — UI and feature specifications
- [Authentication](../docs/overview/architecture/auth-overview.md) — Auth architecture and JWT flows
- [Security](../docs/requirements/security/SECURITY.md) — Security requirements
- [Deployment](../docs/overview/infrastructure/deployment.md) — Platform and traffic routing
- [All docs](../docs/README.md)
- [Repo-wide rules](../CLAUDE.md)
- [Agent conventions](CLAUDE.md) — Development conventions for agents
