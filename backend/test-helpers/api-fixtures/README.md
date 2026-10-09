# API Fixtures Test Helpers

The full guide and reference material lives in [the documentation catalog](../../../docs/development/testing/backend/api-fixtures.md).

`api-fixtures/v1/mcp-results.json` is a version 1 catalog of identified MCP `tools/call`
results. Each case records `id`, `tool`, `arguments`, and `structuredContent`.
`pnpm run mcp:catalog` generates it alongside `mcp.json`, validating cases against the
cataloged tool input and output schemas; `pnpm run mcp:catalog --check` verifies the
tracked artifact without rewriting it. These are MCP results, not HTTP route fixtures.
