import type { BasicUser } from '@services/users/types'
import type { PostSearchSort } from '@services/posts/search/types'
import type { Tool } from './types.mts'
import { getPostIds } from '@services/posts/search/get-ids'
import { getPostByAnyCachedBatch } from '@services/entity-fetch'
import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import {
  buildSearchToolSchemaProperties,
  normalizeSearchToolArgs,
  type SearchSystemArgs,
} from './search-system.mts'

type ToolArgs = SearchSystemArgs & {
  limit?: number
  sort?: PostSearchSort
  post_type?: 'discussion' | 'review' | 'data_point' | 'comment'
}

type ToolResult = {
  success: true
  results: Array<{
    id: string
    title: string
    markdown: string
    post_type: string
  }>
}

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'search_posts',
    type: 'function',
    description:
      'Search for posts using text, semantic, and similar-item signals. Use search for hybrid text+semantic search.',
    parameters: {
      type: 'object',
      properties: {
        ...buildSearchToolSchemaProperties({
          limitDescription: 'Maximum number of results to return (default: 5, max: 10)',
        }),
        sort: {
          type: 'string',
          enum: ['new', 'best', 'ranking'],
          description:
            'Sort order: new (most recent), best (highest voted), ranking (search relevance)',
        },
        post_type: {
          type: 'string',
          enum: ['discussion', 'review', 'data_point', 'comment'],
          description: 'Filter by post type',
        },
      },
      required: [],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    requiredScopes: { mcp: ['posts:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/posts' }],
  },
  function:
    (currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const normalizedArgs = normalizeSearchToolArgs(args, { defaultLimit: 5, maxLimit: 10 })
      const { sort, post_type } = normalizedArgs

      const searchOptions = {
        exclude_for_user_id: currentUser?.id,
        limit: normalizedArgs.limit,
        sort,
        ...(normalizedArgs.text_search_query && {
          text_search_query: normalizedArgs.text_search_query,
        }),
        ...(normalizedArgs.semantic_search_query && {
          semantic_search_query: normalizedArgs.semantic_search_query,
        }),
        ...(normalizedArgs.similar_post_id && { similar_post_id: normalizedArgs.similar_post_id }),
        ...(normalizedArgs.similar_topic_id && {
          similar_topic_id: normalizedArgs.similar_topic_id,
        }),
        ...(normalizedArgs.similar_rss_feed_item_id && {
          similar_rss_feed_item_id: normalizedArgs.similar_rss_feed_item_id,
        }),
        ...(post_type && { post_types: [post_type] }),
      }

      const { results } = await getPostIds(currentUser, searchOptions)
      const postIds = results.map(r => r.id)

      if (postIds.length === 0) {
        return { success: true, results: [] }
      }

      const posts = await getPostByAnyCachedBatch(postIds)

      const filteredPosts = posts.filter((post): post is NonNullable<typeof post> => post !== null)
      return {
        success: true,
        results: await Promise.all(
          filteredPosts.map(async post => ({
            id: post.id,
            title: await sanitizePromptInjection(post.title, { isTitle: true }),
            markdown: wrapExternalContent(await sanitizePromptInjection(post.markdown), {
              source: 'post',
              contentType: 'user_post',
            }),
            post_type: post.post_type,
          })),
        ),
      }
    },
}

export default tool
