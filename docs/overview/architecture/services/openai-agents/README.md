# @services/openai-agents

Source entrypoint: [backend/services/openai-agents/README.md](../../../../../backend/services/openai-agents/README.md)

The `Tool` contract shared by the MCP tool catalog and `backend/tools`.

## Key exports

- `@services/openai-agents/tool-types` — the `Tool`, `ToolInvocationContext`, `ToolSurface`, `ToolMeta` and related types every tool definition and the MCP adapter share. Import by direct path; the package `index.mts` only re-exports these types for the package-shape rule.

The package no longer executes tool calls. The OpenAI Responses tool-call executor, the role
guard and the shared tool loop were removed with the scoring agents; MCP dispatch lives in
[`@services/mcp-tools`](../../../../../backend/services/mcp-tools/README.md).

## Related

- Parent: [../AGENTS.md](../../../../../backend/services/AGENTS.md)
- OpenAI utils module: [../../modules/openai-utils/README.md](../../backend/modules/openai-utils/README.md)
- AI agents system: [../../queues/ai-agents/README.md](../../queues/ai-agents/README.md)
