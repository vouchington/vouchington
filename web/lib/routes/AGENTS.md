# Route factories

- Resolve slug-or-id `params.id` through `getTopic`; pass the resolved `topic.id` UUID to APIs, never raw route params.
- New pages update factory mocks and route-glob coverage in `web/lib/routes/__tests__/app-routes-smoke.mock.test.tsx`.
- Entity admin pages outside `/admin/` call `requireAdmin()` in page/entity layout. Referral factories additionally reject non-`referral_program` topics with `notFound()`.
- Thin routes outside internal `settings/` bind factory results and explicitly export default/`generateMetadata`; bare re-exports evade metadata detection.
- Signed-out component actions use `useLoginHref(intent)`; gate user-specific content at call sites under [signed-out actions](../../../docs/requirements/navigation/SIGNED_OUT_ACTIONS.md).
- PageWithAside renders desktop/mobile copies; Playwright uses `getAsideLocator(page, '<id>')` for aside IDs.
- Follow [relocation/canonical URL rules](../../../docs/requirements/navigation/ROUTES.md) and inherited [web instructions](../../AGENTS.md).
