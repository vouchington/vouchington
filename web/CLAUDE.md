# Web

Next.js app. Use [README.md](README.md) and [tests.md](../docs/development/tests.md) for commands. Use
the [local-site-testing skill](../.agents/skills/local-site-testing/SKILL.md) for local QA and the
[agent-workflow implementation rules](../.agents/skills/agent-workflow/implementation.md)
for PR evidence; never commit screenshots.
Batch all compatible changed web source files in one planner invocation before running selected
tests; follow the [canonical before-push recipe](../docs/checklists/commit.md#before-pushing).
Run production Next and Storybook builds through the package scripts (`next build` /
`storybook build` directly — no build lock, since GitHub-hosted runners are single-job VMs).

## Rules

- Read [web-agent-rules.md](../docs/development/web-agent-rules.md) before changing navigation,
  route structure, page headers, bookmark registration, or component/test conventions. Product
  contracts live under [docs/requirements](../docs/requirements/README.md).
- Pages under `web/app/(my)/` follow [(my)/CLAUDE.md](<app/(my)/CLAUDE.md>).
- Every database-backed list renders page one on the server and supports cursor continuation; see
  [pagination.md](../docs/overview/architecture/pagination.md).
- Server components call `getCurrentUser()`; client components use `useAuth()` and do not receive
  `currentUser` across the RSC/client boundary. GET helpers in `web/lib/api/server/**` are already
  `React.cache`-wrapped — see [lib/api/server/CLAUDE.md](lib/api/server/CLAUDE.md).
- Do not proxy mutations through inline `'use server'` actions. Call client API helpers from client
  components.
- Entity URLs must come from canonical helpers — never hand-build path templates. See
  [Entity Link Helpers](lib/links/CLAUDE.md).
- External image URLs render through the `/sideload/` proxy via `ProxiedImage`, not bare
  `next/image`.
- Browser-visible config is injected at runtime through the public config bootstrap (the
  `IMAGE_ORIGIN` pattern), not a new Docker build arg. See
  [environment variables reference](../docs/overview/infrastructure/reference-environment-variables-web-build-time-and-runtime-public-config.md).
- `data-pw` is the Playwright test-ID; production source must not use `data-testid`. See
  [web-agent-rules.md](../docs/development/web-agent-rules.md#components-and-tests).
- React Compiler is enabled; avoid identity-only memoization. See
  [Pure Component Contracts](../docs/requirements/navigation/reference-components-patterns.md#pure-component-contracts).
- Before adding or changing a Vitest test, fixture, or mock, load the
  [web-vitest-test-authoring skill](../.agents/skills/web-vitest-test-authoring/SKILL.md).
- API changes update fixtures plus Swift/.NET tests.

## See Also

Workspace catalogs, requirement-doc cross-references, and entity matrices are indexed in
[README.md](README.md).
