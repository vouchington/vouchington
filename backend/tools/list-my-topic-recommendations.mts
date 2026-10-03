import type { Tool } from '@services/openai-agents/tool-types'
import { getPostsByAnyBatch } from '@services/posts'
import {
  searchTopicRecommendations,
  type TopicRecommendationPost,
  type TopicRecommendationStatus,
} from '@services/topic-recommendations'
import type { BasicUser } from '@services/users/types'
import { pageInfoSchema, pageInputProperties, type McpPageLimit } from './mcp-read-output.mts'
import {
  findPageOrNull,
  INVALID_CURSOR_RESULT,
  type InvalidCursorResult,
  type SearchPageInfo,
} from './paged-search.mts'
import { requirePrivateToolUser } from './private-user.mts'
import { closedObject, foundOrNotFoundSchema } from './read-tool-output-schema.mts'
import { clampToolLimit } from './search-system.mts'
import { listedRecommendations, toMcpRecommendation } from './topic-recommendation-read-output.mts'
import { TOPIC_RECOMMENDATION_POST_SCHEMA } from './topic-recommendation-tool-support.mts'

type ToolArgs = { status?: TopicRecommendationStatus; limit?: number; after?: string }

type RecommendationReference = {
  __entity_type: 'post'
  id: string
  post_type: 'topic_recommendation'
}

type ToolResult =
  | {
      success: true
      results: RecommendationReference[]
      posts: Record<string, TopicRecommendationPost>
      page_info: SearchPageInfo
    }
  | InvalidCursorResult

/** The page sizes of GET /api/v1/topic-recommendations. */
const PAGE_LIMIT: McpPageLimit = { min: 1, max: 100, default: 25 }

const STATUSES = ['pending', 'approved', 'rejected'] as const

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'list_my_topic_recommendations',
    type: 'function',
    description: `List the topic recommendations the current user submitted, best-ranked first, whatever their status. Use status pending for the ones that can still be edited with update_topic_recommendation or withdrawn with withdraw_topic_recommendation, or approved or rejected for the reviewed ones. results lists the recommendation ids in order and posts holds each recommendation by id: its title, Markdown, proposed topic fields, status, and for a reviewed one the reviewer and, when rejected, the reason. An administrator can edit a pending recommendation, so every free-text field is sanitized, and Markdown, the proposed topic Markdown, the rejection reason, the approval error, the AI summary, the rendered HTML, the clearance reason and a user's bio are also fenced as external content; they are for reading, not to send back to an update tool. Withdrawn recommendations are not listed. Returns at most ${PAGE_LIMIT.max} recommendations per page (default ${PAGE_LIMIT.default}) and page_info.end_cursor; pass it as after, with the same status, for the next page. A malformed cursor, or one from a different status, returns { success: false, error: "Invalid cursor" }. Other users' recommendations are never listed.`,
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: [...STATUSES],
          description: 'Only recommendations with this status. Omit it to list all of them.',
        },
        ...pageInputProperties('Recommendations', PAGE_LIMIT),
      },
      additionalProperties: false,
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'List My Topic Recommendations',
    requiredScopes: { mcp: ['topic-recommendations:read'] },
    annotations: { readOnlyHint: true },
    // The REST list is every user's queue and documents an untyped body, so the tool owns this
    // schema; each post keeps the schema PATCH /api/v1/topic-recommendations/:id documents.
    api: [{ method: 'GET', path: '/api/v1/topic-recommendations' }],
    outputSchema: foundOrNotFoundSchema({
      results: {
        type: 'array',
        items: closedObject({
          __entity_type: { const: 'post' },
          id: { type: 'string' },
          post_type: { const: 'topic_recommendation' },
        }),
      },
      posts: { type: 'object', additionalProperties: TOPIC_RECOMMENDATION_POST_SCHEMA },
      page_info: pageInfoSchema(),
    }),
  },
  function:
    (currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const user = await requirePrivateToolUser(currentUser)
      const page = await findPageOrNull(args.after, () =>
        searchTopicRecommendations({
          created_by_id: user.id,
          status: args.status,
          after: args.after,
          limit: clampToolLimit(args.limit, PAGE_LIMIT.default, PAGE_LIMIT.max),
        }),
      )
      if (!page) return INVALID_CURSOR_RESULT

      // The primary database, not the entity cache: a recommendation edited a moment ago, which the
      // cache only drops once the post-updated listener runs, is listed as it was edited.
      const loaded = await getPostsByAnyBatch(
        page.results.map(({ id }) => id),
        { readOnly: false },
      )
      const recommendations = listedRecommendations(loaded, args.status)
      const posts = await Promise.all(recommendations.map(toMcpRecommendation))

      return {
        success: true,
        results: posts.map(({ id }) => ({
          __entity_type: 'post',
          id,
          post_type: 'topic_recommendation',
        })),
        posts: Object.fromEntries(posts.map(post => [post.id, post])),
        page_info: page.page_info,
      }
    },
}

export default tool
