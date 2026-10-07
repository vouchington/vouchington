import { getPaginationLimits } from '@services/pagination'
import type { BasicUser } from '@services/users/types'
import type { PostSearchSort } from '@services/posts/search/types'
import type { Tool } from '@services/openai-agents/tool-types'
import { getPostIds } from '@services/posts/search/get-ids'
import { getPostByAnyCachedBatch } from '@services/entity-fetch'
import { preparePostsSearchParams, resolvePostsSearchParams } from '@services/search-params'
import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import { VALID_FILTERABLE_POST_TYPES, type FilterablePostType } from '@ts-shared/feed-capabilities'
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
import { resolveReadableThread } from './mcp-post-access.mts'
import { objectSchema, outcomeSchema } from './output-schema-shapes.mts'
import { componentSchema } from './route-response-schema.mts'

// The sorts GET /api/v1/posts accepts.
const POST_SORTS = [
  'new',
  'best',
  'hot',
  'relevance',
  'following_new',
] as const satisfies readonly PostSearchSort[]

type ToolArgs = PagedSearchArgs & {
  sort?: (typeof POST_SORTS)[number]
  post_type?: FilterablePostType
}

type ToolResult =
  | {
      success: true
      results: Array<{
        id: string
        title: string
        markdown: string
        post_type: string
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
    items: objectSchema({
      id: { type: 'string' },
      title: { type: 'string' },
      markdown: { type: 'string' },
      post_type: { type: 'string' },
    }),
  },
  page_info: componentSchema('PageInfo'),
})

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'search_posts',
    type: 'function',
    description:
      'Search for posts using keyword (text_search_query or q), semantic (semantic_search_query), and similar-item signals. Use search for hybrid text+semantic search. Returns page_info.end_cursor; pass it as after to get the next page. A malformed or foreign cursor returns { success: false, error: "Invalid cursor" }.',
    parameters: {
      type: 'object',
      properties: {
        ...pagedSearchSchemaProperties(
          'Keyword search. Same as GET /api/v1/posts q: matches post text and #hashtags.',
        ),
        sort: {
          type: 'string',
          enum: [...POST_SORTS],
          description:
            'Sort order: new (most recent), best (highest voted), hot, relevance (search relevance; the default when searching), following_new',
        },
        post_type: {
          type: 'string',
          enum: [...VALID_FILTERABLE_POST_TYPES],
          description: 'Filter by post type',
        },
      },
      required: [],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp'],
    title: 'Search Posts',
    requiredScopes: { mcp: ['posts:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/posts' }],
    outputSchema: OUTPUT_SCHEMA,
  },
  function:
    (currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const page = await findPageOrNull(args.after, async () => {
        const prepared = preparePostsSearchParams(
          {
            ...pagedSearchQuery(args),
            ...(args.sort && { sort: args.sort }),
            ...(args.post_type && { post_types: args.post_type }),
          },
          getPaginationLimits(25),
        )
        const { shouldReturnEmpty, searchOptions } = await resolvePostsSearchParams(prepared)
        if (shouldReturnEmpty) return { results: [], page_info: EMPTY_PAGE_INFO }

        // A similar-post seed the caller cannot read through get_post answers like a seed that does
        // not exist: its embedding must not rank anything for them. A tool call always has a user,
        // so a missing one gets an empty page rather than a crash.
        const { similar_post_id } = searchOptions
        if (
          similar_post_id &&
          !(currentUser && (await resolveReadableThread(currentUser, similar_post_id)))
        ) {
          return { results: [], page_info: EMPTY_PAGE_INFO }
        }

        // Every candidate is judged like get_post judges it (the credential owner minus private
        // data), so an owner's private or uncleared post is not returned. Muted and blocked users,
        // topics and hostnames still stay out of the caller's results.
        return getPostIds(currentUser, {
          ...searchOptions,
          omitLimit: false,
          exclude_for_user_id: currentUser?.id,
          public_eligibility_only: true,
        })
      })
      if (!page) return INVALID_CURSOR_RESULT
      const { results, page_info } = page
      const posts = await getPostByAnyCachedBatch(results.map(result => result.id))
      const visiblePosts = posts.filter((post): post is NonNullable<typeof post> => post !== null)

      return {
        success: true,
        results: await Promise.all(
          visiblePosts.map(async post => ({
            id: post.id,
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
