# Primary Packages

[Back to Monorepo Map](MONOREPO.md#primary-packages)

Primary code packages are the units exposed through root typecheck, lint, static-analysis, and test scripts:

| Workspace                                             | CLAUDE.md                                                              | Purpose                                                                                                                                         |
| ----------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [`backend/`](../../backend)                           | [backend/CLAUDE.md](../../backend/CLAUDE.md)                           | Node.js TypeScript API server and background workers. Owns business logic and data access.                                                      |
| [`web/`](../../web)                                   | [web/CLAUDE.md](../../web/CLAUDE.md)                                   | Next.js app served behind the CF Worker. RSC + client routes, no business logic.                                                                |
| [`cloudflare-worker/`](../../cloudflare-worker)       | [cloudflare-worker/CLAUDE.md](../../cloudflare-worker/CLAUDE.md)       | Edge worker for traffic routing, caching, and CSP. The only public entry point.                                                                 |
| [`lambdas/image-resize/`](../../lambdas/image-resize) | [lambdas/image-resize/CLAUDE.md](../../lambdas/image-resize/CLAUDE.md) | AWS Lambda for image resizing and proxying.                                                                                                     |
| [`ts-shared/`](../../ts-shared)                       | [ts-shared/CLAUDE.md](../../ts-shared/CLAUDE.md)                       | Pure TypeScript shared between backend, web, lambdas, and worker. Runtime dependencies must be universal across Node.js, browsers, and Workers. |
