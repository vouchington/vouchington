# Test Command Matrix

[Back to Tests and Checks](tests.md#test-command-matrix)

| Command                                 | What                                                                                                                                                  | Init     |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `pnpm run test:backend`                 | All backend (analytics, modules, API server, email, data stores, mocks + AWS†/OpenAI†/Bedrock†)                                                       | monorepo |
| `pnpm run test:backend:core`            | Non-credentialed backend only                                                                                                                         | monorepo |
| `pnpm run test:backend:postgres-schema` | PostgreSQL final-state schema invariants after migrations                                                                                             | web      |
| `pnpm run test:ts-shared`               | Shared TS packages                                                                                                                                    | monorepo |
| `pnpm run test:email-templates`         | Email template render                                                                                                                                 | monorepo |
| `pnpm run test:web`                     | Web client unit tests                                                                                                                                 | monorepo |
| `pnpm run test:web-api`                 | Next.js route handler tests                                                                                                                           | web      |
| `pnpm run test:integration:web`         | Full-stack web integration                                                                                                                            | web      |
| `pnpm run test:web-storybook`           | Storybook unit tests                                                                                                                                  | monorepo |
| `pnpm run test:web-storybook-browser`   | Storybook in real browser                                                                                                                             | monorepo |
| `pnpm run test:cloudflare-worker`       | Worker + worker-mocks                                                                                                                                 | monorepo |
| `pnpm run test:lambdas`                 | Lambdas + lambda-mocks                                                                                                                                | monorepo |
| `pnpm run test:tooling`                 | Tooling self-tests (10 projects; parallel at the root's `maxWorkers`, with 30s test/hook budgets on child-process-heavy suites as a contention hedge) | web      |

`test:tooling` applies environment policy per Vitest project in one parallel run: non-DB tooling projects have worktree DB, Valkey, port, and generated-resource variables removed, while `playwright-helpers` automatically loads and validates the current worktree `.env`. Isolated tooling setup, including `github-actions`, also forces `BASH_ENV=/dev/null` so child bash does not source a host startup file.

†`backend-aws`, `backend-openai`, and `backend-bedrock` are included in `test:backend`, but their suites are automatically skipped when the required credential env vars are absent.
