import type { BasicUser } from '@services/users/types'
import type { Tool } from './types.mts'
import { toolsSearchTopicsSemantic } from '@services/topics/tools/semantic'
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
    name: 'search_topics_semantic',
    type: 'function',
    description:
      'Search topics using semantic similarity (vector embeddings). Best for finding conceptually related topics.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language search query',
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
    requiredScopes: { mcp: ['topics:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/topics' }],
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const limit = clampToolLimit(args.limit, 10, 25)
      const results = await toolsSearchTopicsSemantic(args.query, limit)
      return { success: true, topics: results }
    },
}

export default tool
