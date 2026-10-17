# ts-shared

Shared TypeScript packages used across the TypeScript workspaces (`backend/`, `cloudflare-worker/`, `lambdas/`). Package contracts live in each package under [`ts-shared/`](../../../../ts-shared/README.md).

Why it exists: code that must behave identically in Node.js, the Worker and the browser lives here once, so those runtimes cannot drift. Notable constraints:

- `getDeployEnvironment()` prefers `ENVIRONMENT` over `NODE_ENV`, because ECS sets `NODE_ENV=production` on every task regardless of target. It is server-side only and must not be bundled into browser code.
- Route classification (public versus private discovery paths) is shared by the Worker, web and backend so they cannot disagree about what is indexable.
- UI message catalogs are parity-tested against the canonical locale, and native catalogs are generated into the client repositories, never bundled into web.
