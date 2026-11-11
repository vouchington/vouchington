import { isRecommendationOnly } from '@services/search-params/post-recommendation-filters'
import { getPostHackerNewsSummaries } from '@services/urls/hacker-news-sidecars'
import type { HackerNewsReferenceCounts } from '@services/urls/hacker-news-references-types'
import { mcpHackerNewsReferenceSchema } from './mcp-hacker-news-output.mts'
import { closedObject } from './read-tool-output-schema.mts'
import type { MergedToolSource } from './create-merged-tool.mts'
import { getPaginationLimits } from '@services/pagination'
import type { BasicUser } from '@services/users/types'
import { getPostIds } from '@services/posts/search/get-ids'
import { rejectMcpSimilarSeed } from '@services/posts/public-similar-seed'
import { getPostsWithRootsByAnyCached } from '@services/posts/get-cached-with-roots'
import { labelAndMaskPosts } from '@services/content-provenance'
import {
  preparePostsSearchParams,
  resolvePostsSearchParams,
  validateTopicSearchTerms,
} from '@services/search-params'
import { sanitizePromptInjection } from '@jongleberry/vurst-prompt'
import {
  EMPTY_PAGE_INFO,
  findPageOrNull,
  INVALID_CURSOR_RESULT,
  type InvalidCursorResult,
  pagedSearchQuery,
  pagedSearchSchemaProperties,
  type SearchPageInfo,
} from './paged-search.mts'
import { canonicalEntityId } from './resolve-entity-reference.mts'
import { resolvedTopicFilters } from './resolve-topic.mts'
import { requirePrivateToolUser } from './private-user.mts'
import { outcomeSchema } from '@vouchington/mcp-server/schema'
import { componentSchema } from './route-response-schema.mts'
import {
  postSearchFilterSchemaProperties,
  type SearchPostArgs as ToolArgs,
} from './search-post-input.mts'

type ToolResult =
  | {
      success: true
      results: Array<{
        id: string
        title: string
        post_type: string
        hacker_news_references?: HackerNewsReferenceCounts
      }>
      page_info: SearchPageInfo
    }
  | InvalidCursorResult

// The REST twin returns post ids plus hydration maps; this tool returns sanitized post summaries
// instead, so it owns the schema. The test pins `id`, `post_type` and `page_info` to the OpenAPI
// document. A malformed or foreign cursor is the one failure variant.
const OUTPUT_SCHEMA = outcomeSchema('success', {
  results: {
    type: 'array',
    items: closedObject(
      {
        hacker_news_references: mcpHackerNewsReferenceSchema(),
        id: { type: 'string' },
        title: { type: 'string' },
        post_type: { type: 'string' },
      },
      ['hacker_news_references'],
    ),
  },
  page_info: componentSchema('PageInfo'),
})
const tool: MergedToolSource<ToolArgs, ToolResult> = {
  schema: {
    description: 'Search posts; follow opaque end_cursor while has_next_page.',
    parameters: {
      type: 'object',
      properties: {
        ...pagedSearchSchemaProperties('Search text and up to five #hashtags (REST q).'),
        ...postSearchFilterSchemaProperties(),
      },
      required: [],
    },
  },
  meta: {
    audience: 'user',
    title: 'Search Posts',
    requiredScopes: ['posts:read'],
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/posts' }],
    outputSchema: OUTPUT_SCHEMA,
  },
  function:
    (currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const viewer = currentUser ? await requirePrivateToolUser(currentUser) : undefined
      const postTypes = args.post_types ?? (args.post_type ? [args.post_type] : undefined)
      validateTopicSearchTerms(args, ['topic', 'topics'], !isRecommendationOnly(postTypes))
      validateTopicSearchTerms(args, ['category', 'categories'])
      const page = await findPageOrNull(args.after, async () => {
        const [topics, creator] = await Promise.all([
          resolvedTopicFilters({
            topic: args.topic,
            topics: args.topics,
            review_topic: args.review_topic,
            data_point_topic: args.data_point_topic,
          }),
          args.creator ? canonicalEntityId('user', args.creator) : Promise.resolve(undefined),
        ])
        if (!topics || (args.creator && !creator))
          return { results: [], page_info: EMPTY_PAGE_INFO }
        const prepared = preparePostsSearchParams(
          {
            ...pagedSearchQuery(args),
            ...(args.sort && { sort: args.sort }),
            ...(postTypes && { post_types: postTypes }),
            ...(args.categories && { categories: args.categories }),
            ...(args.category && { category: args.category }),
            ...(creator && { creator }),
            ...(args.community_id && { community_id: args.community_id }),
            ...(args.trending_min_score !== undefined && {
              trending_min_score: args.trending_min_score,
            }),
            ...(topics.data_point_topic && { data_point_topic: topics.data_point_topic }),
            ...(args.data_point_vertical && { data_point_vertical: args.data_point_vertical }),
            ...(args.data_point_result !== undefined && {
              data_point_result: args.data_point_result,
            }),
            ...(args.data_point_credit_score_range !== undefined && {
              data_point_credit_score_range: args.data_point_credit_score_range,
            }),
            ...(topics.review_topic && { review_topic: topics.review_topic }),
            ...(args.story_id && { story_id: args.story_id }),
            ...(args.topic_recommendation_status && {
              topic_recommendation_status: args.topic_recommendation_status,
            }),
            ...(args.has_hacker_news_references !== undefined && {
              has_hacker_news_references: args.has_hacker_news_references,
            }),
            ...(args.time_range && { time_range: args.time_range }),
            ...(topics.topic && { topic: topics.topic }),
            ...(topics.topics && { topics: topics.topics }),
            ...(args.url && { url: args.url }),
          },
          getPaginationLimits(25),
        )
        const { shouldReturnEmpty, searchOptions } = await resolvePostsSearchParams(prepared)
        if (
          shouldReturnEmpty ||
          (await rejectMcpSimilarSeed(viewer !== undefined, searchOptions.similar_post_id))
        )
          return { results: [], page_info: EMPTY_PAGE_INFO }
        return getPostIds(viewer, {
          ...searchOptions,
          omitLimit: false,
          ...(viewer && { exclude_for_user_id: viewer.id }),
        })
      })
      if (!page) return INVALID_CURSOR_RESULT
      const { results, page_info } = page
      const { posts, roots } = await getPostsWithRootsByAnyCached(results.map(result => result.id))
      const masked = await labelAndMaskPosts([...posts, ...roots], viewer)
      const visiblePosts = masked
        .slice(0, posts.length)
        .filter((post): post is NonNullable<typeof post> => post != null)
      const references = await getPostHackerNewsSummaries(visiblePosts.map(post => post.id))
      return {
        success: true,
        results: await Promise.all(
          visiblePosts.map(async post => ({
            id: post.id,
            ...(references[post.id] && { hacker_news_references: references[post.id] }),
            title: await sanitizePromptInjection(post.title, { isTitle: true }),
            post_type: post.post_type,
          })),
        ),
        page_info,
      }
    },
}
export default tool
