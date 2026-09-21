import { getWikipediaSummary } from '@modules/wikipedia-api'
import type { BasicUser } from '@services/users/types'
import type { Tool } from './types.mts'

type ToolArgs = {
  title: string
}

type ToolResult =
  | {
      found: false
      error: string
    }
  | {
      found: true
      pageid: number
      title: string
      url: string
      description: string | null
      extract: string | null
      thumbnail_url: string | null
    }

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_wikipedia_summary',
    type: 'function',
    description:
      'Gets detailed summary information for a Wikipedia article by title. Returns the full Wikipedia page data including description, extract, URL, and thumbnail. Use this after searching to get complete details about a specific article.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'The exact Wikipedia article title (e.g., "Artificial intelligence")',
        },
      },
      required: ['title'],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    requiredScopes: { mcp: ['wikipedia:read'] },
    annotations: { readOnlyHint: true, openWorldHint: true },
    api: null,
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      let summary: Awaited<ReturnType<typeof getWikipediaSummary>>
      try {
        summary = await getWikipediaSummary(args.title)
      } catch (error) {
        return {
          found: false,
          error: error instanceof Error ? error.message : 'Wikipedia API error',
        }
      }

      if (!summary) {
        return {
          found: false,
          error: 'Wikipedia article not found',
        }
      }

      return {
        found: true,
        pageid: summary.pageid,
        title: summary.title,
        url: summary.url,
        description: summary.description,
        extract: summary.extract,
        thumbnail_url: summary.thumbnail_url,
      }
    },
}

export default tool
