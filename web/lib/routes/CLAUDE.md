# Route Factories

Shared factories for thin Next.js App Router pages under `web/app/(topics)/`.

## Rules

- Treat `params.id` as a slug-or-id lookup value. After `getTopic(params.id)`, pass the resolved
  `topic.id` UUID to downstream APIs, never the route parameter.
- When adding a route page, add its factory mock and route glob coverage to
  `web/lib/routes/__tests__/app-routes-smoke.mock.test.tsx`.
- Entity-scoped admin pages outside `/admin/` do not inherit the admin layout gate. The page or its
  entity layout must call `requireAdmin()`.
- Referral validation factories must require admin access and reject non-`referral_program` topics
  with `notFound()`.
- Thin route files outside internal `settings/` paths must bind the factory result and explicitly
  export its `generateMetadata` and default members; a bare re-export is not detected by the
  metadata guard.
- When exposing a component to signed-out users, audit every action CTA through `useLoginHref(intent)`
  and gate user-specific content at its call site. Follow
  [SIGNED_OUT_ACTIONS.md](../../../docs/requirements/navigation/SIGNED_OUT_ACTIONS.md).
- `PageWithAside` renders desktop and mobile copies. Playwright locators for aside `data-pw` values
  must use `getAsideLocator(page, '<id>')` so strict mode and selector coverage agree.

Follow the route relocation audit and canonical URL rules in
[ROUTES.md](../../../docs/requirements/navigation/ROUTES.md) and [web rules](../../CLAUDE.md).
