# Modules

Modules are generic, business-logic-agnostic re-usable modules.
Modules SHOULD NOT use any data-stores - if a data-store is needed, most likely it is a service.

Generic algorithms belong in first-party packages (`@vouchington/*`, `@jongleberry/api-server`).
Local modules that wrap those packages keep Voucha env names, catalogs, HTTP 422/400 boundaries,
and process orchestration. Do not re-queue those facades as extract-the-module work. See
[First-Party Dependencies](../../docs/development/first-party-dependencies.md). Node-only helpers
(`node:zlib`, `node:net`, `node:crypto` buffers) stay out of isomorphic `@vouchington/utils`.

## Related

- ActivityPub inbox storage policy: [activitypub-inbox-storage-policy/README.md](activitypub-inbox-storage-policy/README.md)
- Error handling: [on-error/README.md](on-error/README.md)
- OpenRouter retained-agent transport: [openrouter-utils/README.md](openrouter-utils/README.md)
- API and OAuth scope grammar: [scopes/README.md](scopes/README.md)
- Backend context: [../CLAUDE.md](../CLAUDE.md)
- Services (use modules; use data-stores): [../services/CLAUDE.md](../services/CLAUDE.md)
