# Primary Packages

[Back to Monorepo Map](MONOREPO.md#primary-packages)

Primary code packages are the units exposed through root typecheck, lint, static-analysis, and test scripts:

| Workspace                                             | AGENTS.md                                                              | Purpose                                                                                                                                         |
| ----------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [`backend/`](../../backend)                           | [backend/AGENTS.md](../../backend/AGENTS.md)                           | Node.js TypeScript API server and background workers. Owns business logic and data access.                                                      |
| [`web/`](../../web)                                   | [web/AGENTS.md](../../web/AGENTS.md)                                   | Next.js app served behind the CF Worker. RSC + client routes, no business logic.                                                                |
| [`cloudflare-worker/`](../../cloudflare-worker)       | [cloudflare-worker/AGENTS.md](../../cloudflare-worker/AGENTS.md)       | Edge worker for traffic routing, caching, and CSP. The only public entry point.                                                                 |
| [`lambdas/image-resize/`](../../lambdas/image-resize) | [lambdas/image-resize/AGENTS.md](../../lambdas/image-resize/AGENTS.md) | AWS Lambda for image resizing and proxying.                                                                                                     |
| [`ts-shared/`](../../ts-shared)                       | [ts-shared/AGENTS.md](../../ts-shared/AGENTS.md)                       | Pure TypeScript shared between backend, web, lambdas, and worker. Runtime dependencies must be universal across Node.js, browsers, and Workers. |
