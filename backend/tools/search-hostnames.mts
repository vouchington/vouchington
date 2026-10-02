import { parseHostnamesSearchParams } from '@services/search-params'
import { searchUrlHostnames } from '@services/urls-hostnames'
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
  query?: string
  hostname?: string
  topic?: string
  sort?: 'trust'
  limit?: number
  after?: string
}

type ToolResult = McpHostnamesPage | InvalidCursorResult

const { default: defaultLimit, max } = HOSTNAME_PAGE_LIMIT

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'search_hostnames',
    type: 'function',
    description: `Search the hostnames Voucha knows, as a signed-out reader sees them: an administratively blocked hostname never appears, whoever asks. Each hostname carries its topic_id and its public trust vote totals (election). query and hostname both match part of the hostname. topic is a topic UUID or slug; a topic that does not exist returns no results. Sorted by hostname (A to Z, the default) or, with sort "trust", by net trust votes (highest first). Returns at most ${max} hostnames per page and page_info.end_cursor; pass it as after, with the same sort, to get the next page. A malformed cursor, or one from a different sort, returns { success: false, error: "Invalid cursor" }.`,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Part of the hostname to match. Same as GET /api/v1/hostnames query.',
        },
        hostname: {
          type: 'string',
          description: 'Part of the hostname to match. Same as GET /api/v1/hostnames hostname.',
        },
        topic: { type: 'string', description: 'Only hostnames of this topic UUID or slug' },
        sort: {
          type: 'string',
          enum: ['trust'],
          description:
            'trust sorts by net trust votes, highest first. Omit it to sort by hostname.',
        },
        ...pageInputProperties('Hostnames', HOSTNAME_PAGE_LIMIT),
      },
      required: [],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'Search Hostnames',
    requiredScopes: { mcp: ['hostnames:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/hostnames' }],
    outputSchema: foundOrNotFoundSchema(hostnamesPageProperties()),
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const page = await findPageOrNull(args.after, async () => {
        // A null viewer keeps `blocked: false` and every moderation filter off, like anonymous REST.
        const { shouldReturnEmpty, ...options } = await parseHostnamesSearchParams(
          {
            query: args.query,
            hostname: args.hostname,
            topic: args.topic,
            sort: args.sort,
            after: args.after,
            limit: clampToolLimit(args.limit, defaultLimit, max),
          },
          null,
        )
        return shouldReturnEmpty
          ? { results: [], page_info: EMPTY_PAGE_INFO }
          : searchUrlHostnames(options)
      })
      if (!page) return INVALID_CURSOR_RESULT
      return {
        success: true,
        results: await toMcpHostnames(page.results),
        page_info: page.page_info,
      }
    },
}

export default tool
