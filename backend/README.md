# Voucha Server

Node.js backend consisting of an HTTP server and GlideMQ workers. See [CLAUDE.md](CLAUDE.md) for agent conventions.

## Commands

When touching `backend/**` code, run (from repo root):

- `source .env`
- `pnpm exec oxlint --type-aware --fix --deny-warnings backend`
- `pnpm run oxfmt`
- `pnpm run typecheck:backend`
- `pnpm run test:backend:default` (or `pnpm run test:backend:default -- <files>` for a one-off focused aggregate run); use `pnpm exec vitest run --project <name> <files>`, e.g. `pnpm exec vitest run --project backend-data-stores <file>`, when reproducing one CI project in isolation — see [Project Name Reference](../docs/development/reference-project-name-reference.md)
- `pnpm run test:backend -- --coverage` — generate V8 coverage report (text-summary, lcov, json-summary in `coverage/`)
- `pnpm run test:backend:aws` - Run only AWS S3/SES integration tests (requires AWS credentials; CI runs these in a dedicated trusted-context job)
- `pnpm run test:backend:bedrock` - Run only Bedrock integration tests (requires `BEDROCK_AWS_ACCESS_KEY_ID` and `BEDROCK_AWS_SECRET_ACCESS_KEY`, or a standard AWS credential chain that can invoke Bedrock; set `REQUIRE_BEDROCK_INTEGRATION=true` to fail instead of skip)
- `pnpm run test:backend:openai` - Run only OpenAI integration tests (requires `OPENAI_API_KEY`; CI runs these in a dedicated trusted-context job)
- `pnpm run test:backend:stripe` - Run only Stripe credentialed tests (requires `STRIPE_SECRET_KEY` test-mode key; CI runs these in a dedicated trusted-context job)
- `pnpm run test:backend` - Run default backend tests plus AWS, Bedrock, OpenAI, and Stripe credentialed projects in one Vitest command. The central group runner removes pnpm's one leading argument separator, so appended one-off file filters and Vitest flags remain positional arguments. External-credential tests skip locally when credentials are unavailable
- `pnpm run test:smoke:backend`

When `*.lua` files change: `pnpm run selene`.

EXPLAIN ANALYZE (query performance profiling):

- `pnpm run explain:seed` — seed realistic test data
- `pnpm run explain:run` — capture and EXPLAIN ANALYZE key queries
- `pnpm run explain:analyze` — print markdown summary of latest results
- `pnpm run explain:dump` — dump full SQL + query plans as text (pipe to your LLM tool for analysis)
- When adding cursor pagination over a composite key such as `(created_at, object_id)`, run EXPLAIN ANALYZE and verify the planner uses the expected composite index before pushing.

If you make database changes: `pnpm run db:migrate`, then `pnpm run test:backend:postgres-schema`.

If you see database errors: `source .env && pnpm run db:clean && pnpm run db:migrate`.

## Deployment

See [docs/overview/infrastructure/deployment.md](../docs/overview/infrastructure/deployment.md) for the full deployment reference.

Docker images are built for `linux/arm64` (ECS Fargate) and pushed to ECR:

- ECR: `voucha-api`
- ECR: `voucha-worker-cpu`
- ECR: `voucha-worker-io`

The bundled Rust N-API module is compiled for `aarch64-unknown-linux-gnu` with
`target-cpu=neoverse-n1` (see [https://github.com/jonathanong/vurst](https://github.com/jonathanong/vurst) for the Rust source).

- `GIT_COMMIT` env var is baked in at build time for Sentry release tracking (`process.env.GIT_COMMIT`)
- Backend runs TypeScript natively via Node.js type-stripping (no build step); `GIT_COMMIT` identifies deployed code in Sentry without a separate CI release

## NPM Workspaces & Folder Structure

- Data Stores:
  - `data-stores/psql` aka `@data-stores/psql` - the primary application database
  - `data-stores/valkey` aka `@data-stores/valkey` - the Valkey connection instances
- Modules:
  - `modules/*` aka `@modules/*` - reusable modules that contain no business logic
  - [ActivityPub inbox storage policy](modules/activitypub-inbox-storage-policy/README.md) - durable inbox retention, capacity, cleanup, and retry bounds
- Business Logic:
  - `services/*` aka `@services/*` - services for business logic, re-used across jobs, APIs, and other entry points
  - `queues/*` aka `@queues/*` - GlideMQ queue clients, configuration, and enqueue APIs grouped by domain
  - `workers/*` aka `@workers/*` - worker registrations and processors grouped by domain
  - `flows/*` aka `@flows/*` - shared flow producers and flow enqueue APIs
  - `agents/*` aka `@agents/*` - LLM Agents
  - `tools/*` aka `@tools/*` - tools for LLM Agents
  - `api/*` aka `@voucha/api` - API route definitions
  - [`entrypoints/api/`](entrypoints/api/) aka `@entrypoints/api` - the entry point for the API server
  - [`entrypoints/worker-cpu/`](entrypoints/worker-cpu/) aka `@entrypoints/worker-cpu` - the entry point for the CPU worker (Rust NAPI, Lightpanda, sharp), which runs CPU-bound `@workers/*`
  - [`entrypoints/worker-io/`](entrypoints/worker-io/) aka `@entrypoints/worker-io` - the entry point for the IO worker (IO-only queues), which runs IO-bound `@workers/*`
- Development:
  - [`test-helpers/`](test-helpers/) aka `@voucha/test-helpers` - the entry point for test helpers
  - [`types/`](types/) aka `@voucha/types` - a module for all TypeScript types. All shared types for business logic belong here. For example, `Post` type belongs here, but we don't need a shared type for `migrations` here.

## Pagination Cursor Types

Full usage: [modules/pagination/README.md](modules/pagination/README.md)

- `simple`: `{ id: string }` - For ID-only pagination
- `score`: `{ score: number, id: string }` - For score-based sorting
- `ranking`: `{ ranking: number, id: string }` - For ranking-based sorting
- `timestamp`: `{ timestamp: number, id: string }` - For time-based sorting
- `name`: `{ name: string, id: string }` - For name+ID composite keys
- `tier`: `{ tier: number, id: string }` - For tier-based sorting

## Data Stores

- **PostgreSQL** (schema reference, migrations, query rules): [data-stores/psql/README.md](data-stores/psql/README.md)
- **Valkey** (batching, Lua scripts, read/write clients): [data-stores/valkey/CLAUDE.md](data-stores/valkey/CLAUDE.md)

## Related

When working in backend/, follow the links below to read relevant context. Update wiki docs (README.md, docs/\*\*) when changes affect documented behavior.

- **API routes**: [api/CLAUDE.md](api/CLAUDE.md)
- **Business logic**: [services/CLAUDE.md](services/CLAUDE.md)
- **Job queues (GlideMQ)**: [queues/CLAUDE.md](queues/CLAUDE.md)
- **Job workers**: [workers/CLAUDE.md](workers/CLAUDE.md)
- **Flow producers**: [flows/CLAUDE.md](flows/CLAUDE.md)
- **API entry**: [entrypoints/api/CLAUDE.md](entrypoints/api/CLAUDE.md)
- **CPU worker entry**: [entrypoints/worker-cpu/README.md](entrypoints/worker-cpu/README.md)
- **IO worker entry**: [entrypoints/worker-io/README.md](entrypoints/worker-io/README.md)
- **PostgreSQL schema**: [data-stores/psql/README.md](data-stores/psql/README.md)
- **Valkey**: [data-stores/valkey/CLAUDE.md](data-stores/valkey/CLAUDE.md)
- **Reusable modules**: [modules/README.md](modules/README.md)
- **Shared types**: [types/README.md](types/README.md)
- **Test helpers**: [test-helpers/README.md](test-helpers/README.md)
