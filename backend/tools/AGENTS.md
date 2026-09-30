# Agent tools

- Curry each tool function with `currentUser` first. Extra curry arguments use `Tool<ToolArgs, ToolResult, [ExtraArg]>`, never `Omit<Tool, 'function'>` reconstruction; pass them through `withCurry` from `@agents/_shared`.
- Import tools by direct path, never the barrel, and wire them through `buildAgentTools` from `@agents/_shared`.
- Search/discovery tools exclude internal workflow-only post types, including `topic_recommendation`.
- Search tools reuse `SearchSystemArgs`, `clampToolLimit`, `normalizeSearchToolArgs`, and `buildSearchToolSchemaProperties` from `search-system.mts`.
- Paged search tools (`search_posts`, `search_topics`) build their REST query through `paged-search.mts` and parse it with `@services/search-params`, so limits and cursors match the REST twin. Leave `limit` without a schema `maximum`: the REST parser clamps it.
- Every tool exposed on `mcp` or `admin_mcp` declares `meta.outputSchema`; the catalog test fails for one that does not. A new list of related rows is bounded and paged, the way `get_topic_details` pages children (`@services/topics/children-page`).
- Crawl-search variants use `createCrawlSearchTool(options)`; CRUD manage-my tools use `createManageEntityTool(config)`.
- Tools reading private fields or writing hydrate `BasicUser` through `requirePrivateToolUser()` and explicitly authorize before mutating services.
- Inventory/examples belong in [agent docs](../agents/); apply [agent invariants](../agents/AGENTS.md) and use [tool architecture](../../docs/overview/architecture/agent-tools/README.md).
