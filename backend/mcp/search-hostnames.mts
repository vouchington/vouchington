import type { MergedToolSource } from './create-merged-tool.mts'
import { getPaginationLimits } from '@services/pagination'
import { parseHostnamesSearchParams } from '@services/search-params'
import { searchUrlHostnames } from '@services/urls-hostnames'
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
  include_descendants?: boolean
  topic_match?: 'any' | 'all'
  topics?: string[]
}

type ToolResult = McpHostnamesPage | InvalidCursorResult

const { default: defaultLimit, max } = HOSTNAME_PAGE_LIMIT

const tool: MergedToolSource<ToolArgs, ToolResult> = {
  schema: {
    description:
      'Search known hostnames as a signed-out reader sees them; administratively blocked ones never appear. query and hostname match part of a hostname. Results include topic_id and trust votes. Filter by topic UUID or slug. Sort by hostname (default) or net trust votes (highest first).',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
        },
        hostname: {
          type: 'string',
        },
        topic: { type: 'string', description: 'Only hostnames of this topic UUID or slug' },
        sort: {
          type: 'string',
          enum: ['trust'],
          description:
            'trust sorts by net trust votes, highest first. Omit it to sort by hostname.',
        },
        ...pageInputProperties('Hostnames', HOSTNAME_PAGE_LIMIT),
        include_descendants: { type: 'boolean' },
        topic_match: { type: 'string', enum: ['any', 'all'] },
        topics: { type: 'array', items: { type: 'string' } },
      },
      required: [],
    },
  },
  meta: {
    audience: 'user',
    title: 'Search Hostnames',
    requiredScopes: ['hostnames:read'],
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
            topics: args.topics,
            topic_match: args.topic_match,
            include_descendants: args.include_descendants,
            sort: args.sort,
            after: args.after,
            limit: clampToolLimit(args.limit, defaultLimit, max),
          },
          null,
          getPaginationLimits(50),
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
