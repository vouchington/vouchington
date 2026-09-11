# Smoke Tests

[Back to Tests and Checks](tests.md#smoke-tests)

| Command                                 | What                                                                      | Init     |
| --------------------------------------- | ------------------------------------------------------------------------- | -------- |
| `pnpm run test:smoke:backend`           | Backend server + worker start                                             | monorepo |
| `pnpm run test:smoke:cloudflare-worker` | CF Worker builds and answers `/robots.txt` over HTTP on an allocated port | monorepo |
| `pnpm run test:smoke:image-lambda`      | Image lambda starts and answers `/health` over HTTP on an allocated port  | monorepo |
| `pnpm run test:smoke:web`               | Next.js starts                                                            | web      |
