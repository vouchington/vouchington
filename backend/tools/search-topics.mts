import type { BasicUser } from '@services/users/types'
import type { Tool } from './types.mts'
import { getTopicIds } from '@services/topics/search/get-ids'
import {
  buildSearchToolSchemaProperties,
  normalizeSearchToolArgs,
  type SearchSystemArgs,
} from './search-system.mts'

type ToolArgs = SearchSystemArgs

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
    name: 'search_topics',
    type: 'function',
    description:
      'Search topics using text, semantic, and similar-item signals. Use search for hybrid text+semantic search.',
    parameters: {
      type: 'object',
      properties: buildSearchToolSchemaProperties({
        limitDescription: 'Max results (default: 10, max: 25)',
      }),
      required: [],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'Search Topics',
    requiredScopes: { mcp: ['topics:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/topics' }],
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const normalizedArgs = normalizeSearchToolArgs(args, { defaultLimit: 10, maxLimit: 25 })
      const { results } = await getTopicIds({
        limit: normalizedArgs.limit,
        text_search_query: normalizedArgs.text_search_query,
        semantic_search_query: normalizedArgs.semantic_search_query,
        similar_post_id: normalizedArgs.similar_post_id,
        similar_topic_id: normalizedArgs.similar_topic_id,
        similar_rss_feed_item_id: normalizedArgs.similar_rss_feed_item_id,
      })

      return {
        success: true,
        topics: results.map(result => ({
          id: result.id,
          name: result.name,
          slug: result.slug,
        })),
      }
    },
}

export default tool
