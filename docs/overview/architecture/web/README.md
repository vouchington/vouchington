# Voucha Web

Next.js app-router frontend for Voucha. The Cloudflare Worker is the public entry point in both development and production; this app handles the page rendering layer.

## Source Of Truth

- SEO and indexability: [docs/requirements/seo/SEO.md](../../../requirements/seo/SEO.md)
- Dynamic rendering: [docs/requirements/navigation/DYNAMIC-RENDERING.md](../../../requirements/navigation/DYNAMIC-RENDERING.md)
- Components and design-system usage: [docs/requirements/navigation/COMPONENTS.md](../../../requirements/navigation/COMPONENTS.md)
- Accessibility: [docs/requirements/navigation/ACCESSIBILITY.md](../../../requirements/navigation/ACCESSIBILITY.md)
- Preferences and local state: [docs/requirements/users/PREFERENCES.md](../../../requirements/users/PREFERENCES.md)
- Caching architecture: [docs/overview/architecture/caching-strategy.md](../caching-strategy.md)
- Aside inventory and page mappings: [docs/requirements/navigation/ASIDES.md](../../../requirements/navigation/ASIDES.md)
- Signed-out user action buttons (vote/follow/hide): [docs/requirements/navigation/SIGNED_OUT_ACTIONS.md](../../../requirements/navigation/SIGNED_OUT_ACTIONS.md)
- Mobile touch targets, shared filters, admin/settings layout primitives, and post preview semantics: [docs/requirements/navigation/COMPONENTS.md](../../../requirements/navigation/COMPONENTS.md) and [docs/requirements/navigation/MOBILE.md](../../../requirements/navigation/MOBILE.md)

The Cloudflare Worker is the public entry point in development and production. Aside layout, component props, routes and local development commands are in the web code, Storybook and the requirements above.
