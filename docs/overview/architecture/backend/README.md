# Backend

Orientation for `backend/`. Commands, package contracts and helper APIs live in the code and each package's AGENTS.md. This
page says which layer owns what.

## Layers

- **Data stores** (`data-stores/psql`, `data-stores/valkey`): the only code that talks to
  PostgreSQL and Valkey connections. See the [PostgreSQL docs](../../../development/postgresql/README.md).
- **Modules** (`modules/*`): reusable code with no business logic.
- **Services** (`services/*`): business logic. See the [services map](../services/README.md).
- **Queues and workers** (`queues/*`, `workers/*`): enqueue and processing. See the [queues map](../queues/README.md).
- **Agents and MCP** (`agents/*`, `mcp/*`): LLM agents and tool definitions shared by MCP clients and
  internal agents. See [AI agents](../ai-agents/README.md) and [MCP tools](../mcp/README.md).
- **API** (`api/*`): route definitions; thin callers of services.
- **Entrypoints** (`entrypoints/{api,worker-cpu,worker-io}`): process startup. The CPU worker hosts
  CPU-bound processors (native modules, headless browser, image work) and the IO worker hosts
  IO-only queues. Every entrypoint imports `service-registrations` first.
- **Types** (`types/`): shared business-logic types; a type used by one module stays with it.

## Decisions worth knowing

- **Worker concurrency is sized in one place.** The worker process hosts many queue workers, and a
  shared sizing helper keeps one scale knob and one hard ceiling instead of per-worker hard-coded
  values, so deployment shapes of different sizes scale together.
- **Bluesky OAuth is a confidential client.** Token requests are signed with a private key only the
  app holds, and the public key set is embedded in the served client metadata. This earns the longer
  refresh-token lifetime authorization servers grant confidential clients, since a public client's
  refresh tokens cannot be tied to this app.
- **Cursor pagination has typed cursor shapes** (id-only, score, ranking, timestamp, name, tier).
  See [pagination](../pagination.md).
- **The Rust native module targets the deployed Linux architecture,** and the backend runs
  TypeScript natively through type-stripping, so there is no build step.

Test project names for focused runs are in the [project name reference](../../../development/reference-project-name-reference.md).
