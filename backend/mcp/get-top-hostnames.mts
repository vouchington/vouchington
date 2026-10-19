import type { MergedToolSource } from './create-merged-tool.mts'
import { topicReferenceSchema } from './entity-reference-schema.mts'
import { resolvedTopicFilters } from './resolve-topic.mts'
import { searchTopHostnames } from '@services/urls-hostnames/search-top'
import type { BasicUser } from '@services/users/types'
import {
  HOSTNAME_PAGE_LIMIT,
  hostnamesPageProperties,
  toMcpHostnames,
  type McpHostnamesPage,
} from './mcp-hostname-output.mts'
import { pageInputProperties } from './mcp-read-output.mts'
import {
  EMPTY_PAGE_INFO,
  findPageOrNull,
  INVALID_CURSOR_RESULT,
  type InvalidCursorResult,
} from './paged-search.mts'
import { foundOrNotFoundSchema } from './read-tool-output-schema.mts'
import { clampToolLimit } from './search-system.mts'

type ToolArgs = {
  topic?: string
  limit?: number
  after?: string
}

type ToolResult = McpHostnamesPage | InvalidCursorResult

const { default: defaultLimit, max } = HOSTNAME_PAGE_LIMIT

const tool: MergedToolSource<ToolArgs, ToolResult> = {
  schema: {
    description:
      'List hostnames with at least one positive trust vote, highest net trust first, as a signed-out reader sees them. Administratively blocked hostnames never appear. Filter by topic id, slug, or exact name; an unknown topic gives no results.',
    parameters: {
      type: 'object',
      properties: {
        topic: topicReferenceSchema,
        ...pageInputProperties('Hostnames', HOSTNAME_PAGE_LIMIT),
      },
      required: [],
    },
  },
  meta: {
    audience: 'user',
    title: 'Get Top Hostnames',
    requiredScopes: ['hostnames:read'],
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/hostnames/top' }],
    outputSchema: foundOrNotFoundSchema(hostnamesPageProperties()),
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const topics = await resolvedTopicFilters({ topic: args.topic })
      const topicId = topics?.topic
      const page = await findPageOrNull(args.after, async () =>
        args.topic && !topics
          ? { results: [], page_info: EMPTY_PAGE_INFO }
          : searchTopHostnames({
              limit: clampToolLimit(args.limit, defaultLimit, max),
              after: args.after,
              ...(topicId ? { topic_id: topicId } : {}),
            }),
      )
      if (!page) return INVALID_CURSOR_RESULT
      return {
        success: true,
        results: await toMcpHostnames(page.results),
        page_info: page.page_info,
      }
    },
}

export default tool
