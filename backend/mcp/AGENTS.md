# MCP tools

- Tool architecture: [MCP index](../../docs/overview/architecture/mcp/README.md).
- Curry each tool function with `currentUser` first. Extra curry arguments use
  `Tool<ToolArgs, ToolResult, [ExtraArg]>`, never `Omit<Tool, 'function'>` reconstruction.
- Import tools by direct path, never the barrel, and wire them through `buildAgentTools` from `@agents/_shared`.
- Search/discovery tools use the same viewer eligibility as their REST post-discovery twin,
  including topic recommendations when the viewer is eligible. Keep output masking and private-field
  rules consistent across both surfaces.
- Search tools reuse the `search-system.mts` helpers.
- Paged search options (`read_posts(search)`, `discover_topics(search)`) build their REST query
  through `paged-search.mts` and parse it with `@services/search-params`, so limits and cursors
  match the REST twin. Leave `limit` without a schema `maximum`: the REST parser clamps it.
- A new list of related rows is bounded and paged, the way `read_topic(details)` pages children
  (`@services/topics/children-page`); `read_my_lists(items)` resolves a page's posts with
  `resolveReadableThreads`, not per item.
- CRUD manage-my tools use `createManageEntityTool(config)`.
- Tools reading private fields or writing hydrate `BasicUser` through `requirePrivateToolUser()` and
  explicitly authorize before mutating services.
