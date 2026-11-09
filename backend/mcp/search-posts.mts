import { getPostHackerNewsSummaries } from '@services/urls/hacker-news-sidecars'
import type { HackerNewsReferenceCounts } from '@services/urls/hacker-news-references-types'
import { mcpHackerNewsReferenceSchema } from './mcp-hacker-news-output.mts'
import { closedObject } from './read-tool-output-schema.mts'
import type { MergedToolSource } from './create-merged-tool.mts'
import { getPaginationLimits } from '@services/pagination'
import type { BasicUser } from '@services/users/types'
import { getPostIds } from '@services/posts/search/get-ids'
import { getPostsWithRootsByAnyCached } from '@services/posts/get-cached-with-roots'
import { labelAndMaskPosts } from '@services/content-provenance'
import {
  preparePostsSearchParams,
  resolvePostsSearchParams,
  validateTopicSearchTerms,
} from '@services/search-params'
import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import type { SearchPostType } from '@ts-shared/feed-capabilities'
import {
  EMPTY_PAGE_INFO,
  findPageOrNull,
  INVALID_CURSOR_RESULT,
  type InvalidCursorResult,
  pagedSearchQuery,
  pagedSearchSchemaProperties,
  type PagedSearchArgs,
  type SearchPageInfo,
} from './paged-search.mts'
import { canonicalEntityId } from './resolve-entity-reference.mts'
import { resolvedTopicFilters } from './resolve-topic.mts'
import { requirePrivateToolUser } from './private-user.mts'
import { outcomeSchema } from '@vouchington/mcp-server/schema'
import { componentSchema } from './route-response-schema.mts'
import { POST_SORTS, postSearchFilterSchemaProperties } from './search-post-input.mts'

type ToolArgs = PagedSearchArgs & {
  sort?: (typeof POST_SORTS)[number]
  post_type?: SearchPostType
  post_types?: SearchPostType[]
  categories?: string[]
  category?: string
  creator?: string
  community_id?: string
  trending_min_score?: number
  data_point_topic?: string
  data_point_vertical?: string
  review_topic?: string
  story_id?: string
  has_hacker_news_references?: boolean
  time_range?: '1d' | '1w' | '1m' | '1y' | 'all'
  topic?: string
  topics?: string[]
  url?: string
}

type ToolResult =
  | {
      success: true
      results: Array<{
        id: string
        title: string
        markdown: string
        post_type: string
        hacker_news_references?: HackerNewsReferenceCounts
      }>
      page_info: SearchPageInfo
    }
  | InvalidCursorResult

// The REST twin returns post ids plus hydration maps; this tool returns the sanitized post text
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
        markdown: { type: 'string' },
        post_type: { type: 'string' },
      },
      ['hacker_news_references'],
    ),
  },
  page_info: componentSchema('PageInfo'),
})

const tool: MergedToolSource<ToolArgs, ToolResult> = {
  schema: {
    description:
      'Search posts with keyword, semantic, or similar-item signals. Follow the opaque end_cursor while has_next_page is true, including after a short or empty filtered page.',
    parameters: {
      type: 'object',
      properties: {
        ...pagedSearchSchemaProperties(
          'Keyword search. Same as GET /api/v1/posts q: matches post text and up to five #hashtags.',
        ),
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
      validateTopicSearchTerms(args, ['topic', 'topics'], true)
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
            ...(args.post_types && { post_types: args.post_types }),
            ...(!args.post_types && args.post_type && { post_types: args.post_type }),
            ...(args.categories && { categories: args.categories }),
            ...(args.category && { category: args.category }),
            ...(creator && { creator }),
            ...(args.community_id && { community_id: args.community_id }),
            ...(args.trending_min_score !== undefined && {
              trending_min_score: args.trending_min_score,
            }),
            ...(topics.data_point_topic && { data_point_topic: topics.data_point_topic }),
            ...(args.data_point_vertical && { data_point_vertical: args.data_point_vertical }),
            ...(topics.review_topic && { review_topic: topics.review_topic }),
            ...(args.story_id && { story_id: args.story_id }),
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
        if (shouldReturnEmpty) return { results: [], page_info: EMPTY_PAGE_INFO }

        return getPostIds(viewer, {
          ...searchOptions,
          omitLimit: false,
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
            markdown: wrapExternalContent(await sanitizePromptInjection(post.markdown), {
              source: 'post',
              contentType: 'user_post',
            }),
            post_type: post.post_type,
          })),
        ),
        page_info,
      }
    },
}

export default tool
