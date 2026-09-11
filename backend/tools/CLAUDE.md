# Tools

LLM tool definitions for agents. Each tool has a `schema` (passed to the LLM), a `function`
(the implementation), and optional `roles` (access control). Full inventory and examples: check agent README files in [../agents/](../agents/).

## Rules

- The `function` must curry with `currentUser` as the first argument for authorization. Use `Tool<ToolArgs, ToolResult, [ExtraArg]>` as the third type parameter for extra curry args — do not use `Omit<Tool, 'function'> & { function: ... }`.
- When passing a tool with extra curry args to `buildAgentTools`, use `withCurry` from `@agents/_shared`.
- Import tools directly by path, not via the barrel: `import searchPostsTool from '@voucha/tools/search-posts'`.
- Pass tools to `buildAgentTools` from `@agents/_shared` to wire them into an agent.
- Search/discovery tools must not expose internal workflow-only post types. In particular, `topic_recommendation` stays out of generic tools like `search_posts`.
- For new search tools, use `SearchSystemArgs`, `clampToolLimit`, `normalizeSearchToolArgs`, and `buildSearchToolSchemaProperties` from `search-system.mts` instead of duplicating property definitions.
- For new crawl-search variants, use the `createCrawlSearchTool(options)` factory from `search-crawl-tool.mts`.
- For new manage-my-\* tools that dispatch on CRUD actions, use `createManageEntityTool(config)` from `create-manage-entity-tool.mts`.
- Tools that need private user fields or perform writes must hydrate `BasicUser` callers with `requirePrivateToolUser()` and run explicit authorization before calling mutating services.

## See Also

- Agents: [../agents/CLAUDE.md](../agents/CLAUDE.md)
- Tool inventory: [../../docs/overview/architecture/agent-tools/README.md](../../docs/overview/architecture/agent-tools/README.md)
- Backend context: [../CLAUDE.md](../CLAUDE.md)
