import { searchWikipediaByTitle } from '@modules/wikipedia-api'
import type { BasicUser } from '@services/users/types'
import type { Tool } from './types.mts'

type ToolArgs = {
  query: string
  limit?: number
}

type ToolResult =
  | {
      success: true
      results: Array<{
        title: string
        pageid: number
      }>
      count: number
    }
  | {
      success: false
      error: string
    }

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'search_wikipedia',
    type: 'function',
    description:
      'Searches Wikipedia for articles by title. Returns a list of matching Wikipedia pages with their titles and page IDs. Use this to find relevant Wikipedia articles based on keywords or topics mentioned in the content.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'The search query (e.g., "Artificial Intelligence", "Climate Change", "New York")',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 5, max: 10)',
          minimum: 1,
          maximum: 10,
        },
      },
      required: ['query'],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    annotations: { readOnlyHint: true, openWorldHint: true },
    api: null,
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      let results: Awaited<ReturnType<typeof searchWikipediaByTitle>>
      try {
        results = await searchWikipediaByTitle(args.query, args.limit ?? 5)
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Wikipedia search error',
        }
      }
      return {
        success: true,
        results: results.map(r => ({
          title: r.title,
          pageid: r.pageid,
        })),
        count: results.length,
      }
    },
}

export default tool
