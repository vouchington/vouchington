# Web

- Use [web docs](../docs/overview/architecture/web/README.md), [test commands](../docs/development/tests.md), and [local QA](../.agents/skills/local-site-testing/SKILL.md). Follow [validation evidence](../.agents/skills/agent-workflow/implementation.md); never commit screenshots.
- Before push, follow the [canonical before-push recipe](../docs/checklists/commit.md#before-pushing). Production Next/Storybook builds use package scripts (`next build`/`storybook build`) without build locks.
- Read [web conventions](../docs/development/web-agent-rules.md) for navigation/routes/headers/bookmarks/components/tests; product contracts belong in [requirements](../docs/requirements/README.md). Authenticated routes follow [(my) rules](<app/(my)/AGENTS.md>).
- Database lists server-render page one and support [cursor continuation](../docs/overview/architecture/pagination.md).
- Server components use `getCurrentUser()`; clients use `useAuth()` without `currentUser` crossing RSC/client boundaries. GET helpers are already React-cached; follow [server API rules](lib/api/server/AGENTS.md).
- Mutations call client API helpers, never inline `'use server'` proxies. Entity URLs use [canonical link helpers](lib/links/AGENTS.md), never hand-built templates.
- External images use `/sideload/` through `ProxiedImage`, never bare `next/image` URLs.
- Browser config uses runtime public bootstrap (`IMAGE_ORIGIN` pattern), never new Docker build args; follow [public config](../docs/overview/infrastructure/reference-environment-variables-web-build-time-and-runtime-public-config.md).
- Production test IDs use `data-pw`, never `data-testid`. React Compiler is enabled; avoid identity-only memoization under [pure component contracts](../docs/requirements/navigation/reference-components-patterns.md#pure-component-contracts).
- Load [web Vitest authoring](../.agents/skills/web-vitest-test-authoring/SKILL.md) for tests/fixtures/mocks. API changes update fixtures and Swift/.NET tests under the root client-parity contract.
