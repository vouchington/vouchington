// Files in backend/mcp that are factories, helpers, types, or barrels, not tool definitions.
// The static catalog script enumerates the live directory. Unit tests pass a fixture list.
const NON_TOOL_FILES = new Set([
  'my-messages.mts',
  'my-households.mts',
  ...['tool', 'reads', 'writes', 'invitations'].map(name => `my-household-${name}.mts`),
  ...['output', 'tool', 'reads', 'writes'].map(name => `my-message-${name}.mts`),
  'bookmark-tool-support.mts',
  'community-moderation-contract.mts',
  'community-moderation-guards.mts',
  'community-moderation-input-paths.mts',
  'community-moderation-list-writes.mts',
  'community-moderation-other-writes.mts',
  'community-moderation-pending-post-text.mts',
  'community-moderation-output-parts.mts',
  'community-moderation-output-reads.mts',
  'community-moderation-output-schemas.mts',
  'community-moderation-output-writes.mts',
  'community-moderation-queue-writes.mts',
  'community-moderation-read-analytics.mts',
  'community-moderation-read-lists.mts',
  'community-moderation-read-queues.mts',
  'community-moderation-routes.mts',
  'community-moderation-routes-read-add.mts',
  'community-moderation-routes-update-remove.mts',
  'community-moderation-tools.mts',
  'community-moderation-update-applications.mts',
  'community-moderation-update-community.mts',
  'community-moderation-update-modmail-post-settings.mts',
  'community-moderation-update-pinned-posts.mts',
  'community-moderation-update-publications.mts',
  'community-moderation-update-reports.mts',
  'community-moderation-update-vacation.mts',
  'community-moderation-updates.mts',
  'create-get-my-entity-list-tool.mts',
  'create-manage-entity-tool.mts',
  'create-merged-tool.mts',
  'delegated-authority.mts',
  'get-domain-ratings-helpers.mts',
  'get-domain-ratings-output-schema.mts',
  'list-read-access.mts',
  'list-tool-support.mts',
  'mcp-case-output.mts',
  'mcp-community-list-item-output.mts',
  'mcp-community-output.mts',
  'mcp-hostname-output.mts',
  'mcp-list-output.mts',
  'mcp-notification-output.mts',
  'mcp-post-access.mts',
  'mcp-post-output.mts',
  'mcp-read-output.mts',
  'mcp-rss-output.mts',
  'mcp-story-output.mts',
  'mcp-user-output.mts',
  'notification-tool-support.mts',
  'paged-search.mts',
  'preference-tool-support.mts',
  'private-user.mts',
  'personal-feed-support.mts',
  'profile-tool-support.mts',
  'post-write-tool-support.mts',
  'read-tool-output-schema.mts',
  'rss-feed-crawl-reads.mts',
  'rss-feed-discovery.mts',
  'rss-feed-item-reads.mts',
  'rss-feed-item-social-reads.mts',
  'rss-feed-reads.mts',
  'referral-link-tool-support.mts',
  'add-list-items.mts',
  'entity-reference-schema.mts',
  'resolve-entity-reference.mts',
  'resolve-post.mts',
  'resolve-rss-feed.mts',
  'resolve-topic.mts',
  'set-bookmark-batch.mts',
  'route-response-schema.mts',
  'search-system.mts',
  'search-post-input.mts',
  'topic-hierarchy-result.mts',
  'topic-output-schema-parts.mts',
  'topic-recommendation-read-output.mts',
  'topic-recommendation-tool-support.mts',
  'untrusted-output.mts',
])

export interface McpToolFileExport {
  schema?: { name?: string }
}

export interface McpToolGroup {
  options: readonly { source: object }[]
}

/** Tool definition files from one directory listing. Callers own the listing. */
export function mcpToolFilesFromEntries(entries: readonly string[]): string[] {
  return entries
    .filter(
      file =>
        file.endsWith('.mts') &&
        !file.includes('.test.') &&
        !file.includes('.mock.') &&
        !file.includes('.generated.') &&
        !NON_TOOL_FILES.has(file),
    )
    .toSorted()
}

/** Object identity for anonymous tool files, which have no schema name. */
export function anonymousMcpSourceCounts(groups: readonly McpToolGroup[]): Map<object, number> {
  const sourceCounts = new Map<object, number>()
  for (const group of groups) {
    for (const { source } of group.options) {
      sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1)
    }
  }
  return sourceCounts
}

/**
 * A named file must be in the registry. An anonymous file must be one option source,
 * referenced once. A missing default export is unregistered.
 */
export function isUnregisteredMcpToolFile(
  tool: McpToolFileExport | undefined,
  registeredNames: ReadonlySet<string>,
  sourceCounts: ReadonlyMap<object, number>,
): boolean {
  if (tool == null) return true
  const name = tool.schema?.name
  if (name == null) return sourceCounts.get(tool) !== 1
  return !registeredNames.has(name)
}
