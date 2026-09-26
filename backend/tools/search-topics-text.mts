import type { BasicUser } from '@services/users/types'
import type { Tool } from './types.mts'
import { toolsSearchTopicsText } from '@services/topics/tools/text'
import { clampToolLimit } from './search-system.mts'

type ToolArgs = {
  query: string
  limit?: number
}

type ToolResult = {
  success: true
  topics: Array<{
    id: string
    name: string
    slug: string
  }>
}

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'search_topics_text',
    type: 'function',
    description: 'Search topics using text matching. Best for finding topics by name or slug.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Text query to match against topic names and slugs',
        },
        limit: {
          type: 'number',
          description: 'Max results (default: 10, max: 25)',
        },
      },
      required: ['query'],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp'],
    title: 'Search Topics by Text',
    requiredScopes: { mcp: ['topics:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/topics' }],
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const limit = clampToolLimit(args.limit, 10, 25)
      const results = await toolsSearchTopicsText(args.query, limit)
      return { success: true, topics: results }
    },
}

export default tool
