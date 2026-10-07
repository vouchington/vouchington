import { getTopicIdByAnyCached } from '@services/entity-cache'
import { searchTopHostnames } from '@services/urls-hostnames/search-top'
import type { Tool } from '@services/openai-agents/tool-types'
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

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_top_hostnames',
    type: 'function',
    description: `List the most trusted hostnames, as a signed-out reader sees them: hostnames with at least one trust vote up, highest net trust votes first, never an administratively blocked hostname. topic is a topic UUID or slug; a topic that does not exist returns no results. Returns at most ${max} hostnames per page and page_info.end_cursor; pass it as after to get the next page. A malformed cursor returns { success: false, error: "Invalid cursor" }.`,
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Only hostnames of this topic UUID or slug' },
        ...pageInputProperties('Hostnames', HOSTNAME_PAGE_LIMIT),
      },
      required: [],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp'],
    title: 'Get Top Hostnames',
    requiredScopes: { mcp: ['hostnames:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/hostnames/top' }],
    outputSchema: foundOrNotFoundSchema(hostnamesPageProperties()),
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const topicId = args.topic ? await getTopicIdByAnyCached(args.topic) : undefined
      const page = await findPageOrNull(args.after, async () =>
        args.topic && !topicId
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
