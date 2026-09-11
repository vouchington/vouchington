import type { BasicUser } from '@services/users/types'
import type { Tool } from './types.mts'
import { firstVisibleRssTextField } from '@modules/utils'
import { getRssFeedItemByIdCachedBatch } from '@services/entity-fetch'
import { toolsSearchRssFeedItemIds } from '@services/rss-feed-items/tools/search'
import {
  sanitizePromptInjection,
  sanitizeRssContent,
  wrapExternalContent,
} from '@jongleberry/vurst-prompt'
import {
  buildSearchToolSchemaProperties,
  normalizeSearchToolArgs,
  type SearchSystemArgs,
} from './search-system.mts'

type ToolArgs = SearchSystemArgs

type ToolResult = {
  success: true
  results: Array<{
    id: string
    title: string
    markdown: string
    rss_feed_id: string
    guid: string
    published_at: string
    rss_feed_title: string
  }>
}

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'search_rss_feed_items',
    type: 'function',
    description:
      'Search RSS feed items using text, semantic, and similar-item signals. Use search for hybrid text+semantic search.',
    parameters: {
      type: 'object',
      properties: buildSearchToolSchemaProperties({
        limitDescription: 'Maximum number of results to return (default: 10, max: 25)',
      }),
      required: [],
    },
    strict: null,
  },
  meta: { surfaces: ['internal'], annotations: { readOnlyHint: true }, api: null },
  function:
    (currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const normalizedArgs = normalizeSearchToolArgs(args, { defaultLimit: 10, maxLimit: 25 })
      const idResults = await toolsSearchRssFeedItemIds({
        exclude_for_user_id: currentUser?.id,
        limit: normalizedArgs.limit,
        text_search_query: normalizedArgs.text_search_query,
        semantic_search_query: normalizedArgs.semantic_search_query,
        similar_post_id: normalizedArgs.similar_post_id,
        similar_topic_id: normalizedArgs.similar_topic_id,
        similar_rss_feed_item_id: normalizedArgs.similar_rss_feed_item_id,
      })
      const itemIds = idResults.map(result => result.id)

      if (itemIds.length === 0) {
        return { success: true, results: [] }
      }

      const items = await getRssFeedItemByIdCachedBatch(itemIds)

      const filteredItems = items.filter((item): item is NonNullable<typeof item> => item !== null)
      return {
        success: true,
        results: await Promise.all(
          filteredItems.map(async item => ({
            id: item.id,
            title: await sanitizePromptInjection(item.data.title || item.guid, { isTitle: true }),
            markdown: wrapExternalContent(
              await sanitizeRssContent(getRssFeedItemContent(item.data)),
              {
                source: 'rss_feed',
                contentType: 'article',
              },
            ),
            rss_feed_id: item.rss_feed.id,
            guid: item.guid,
            published_at: item.published_at.toISOString(),
            rss_feed_title: await sanitizePromptInjection(item.rss_feed.title || '', {
              isTitle: true,
            }),
          })),
        ),
      }
    },
}

export default tool

function getRssFeedItemContent(data: {
  title?: string
  content?: string
  summary?: string
  description?: string
  'media:description'?: string
  contentSnippet?: string
  'content:encoded'?: string
  'content:encodedSnippet'?: string
}) {
  return firstVisibleRssTextField([
    data['content:encoded'],
    data['content:encodedSnippet'],
    data.content,
    data.contentSnippet,
    data.summary,
    data.description,
    data['media:description'],
  ])
}
