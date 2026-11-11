import type { MergedToolSource } from './create-merged-tool.mts'
import { postReferenceSchema } from './entity-reference-schema.mts'
import {
  COMMENT_DESCENDANTS_LIMIT,
  getCommentDescendantsPage,
  type CommentDescendantsPage,
} from '@services/comments'
import { getPostsOrDeletedCommentStubs, type Post } from '@services/posts'
import type { BasicUser } from '@services/users/types'
import createHttpError from 'http-errors'
import { resolveReadableThread } from './mcp-post-access.mts'
import {
  mcpPostSchema,
  toMcpPostSummaries as toMcpPosts,
  type McpPostSummary as McpPost,
} from './mcp-post-output.mts'
import { closedObject, foundOrNotFoundSchema, pickProperties } from './read-tool-output-schema.mts'
import { parseCommentDescendantPagination } from '@services/search-params/comment-descendant-pagination'

type ToolArgs = {
  post_id: string
  limit?: number
  after?: string
}

type ToolResult =
  | { success: true; descendants: McpPost[]; page_info: CommentDescendantsPage['pageInfo'] }
  | { success: false; error: string }

const { min, max, default: defaultLimit } = COMMENT_DESCENDANTS_LIMIT

const tool: MergedToolSource<ToolArgs, ToolResult> = {
  schema: {
    description:
      'Page child heads/previews. Follow end_cursor even for empty pages. has_next_page signals more heads, not replies; expand via post_id. Hidden replies are placeholders.',
    parameters: {
      type: 'object',
      properties: {
        post_id: postReferenceSchema,
        limit: {
          type: 'integer',
          minimum: min,
          description: `Replies/page, runtime-clamped to ${max} (default ${defaultLimit}); previews may be shorter.`,
        },
        after: { type: 'string' },
      },
      required: ['post_id'],
    },
  },
  meta: {
    audience: 'user',
    title: 'Get Post Descendants',
    requiredScopes: ['posts:read'],
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/posts/:idOrSlug/descendants' }],
    outputSchema: foundOrNotFoundSchema({
      descendants: { type: 'array', items: mcpPostSchema() },
      page_info: closedObject(
        pickProperties('PageInfo', ['has_next_page', 'start_cursor', 'end_cursor']),
      ),
    }),
  },
  function:
    (currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const thread = await resolveReadableThread(currentUser, args.post_id)
      if (!thread) return { success: false, error: 'Post not found' }
      // Match REST viewer visibility; cursors remain scoped to the thread, not the viewer.
      const page = await (async () => {
        const pagination = parseCommentDescendantPagination({
          limit: args.limit,
          after: args.after,
        })
        return getCommentDescendantsPage(thread.viewer ?? null, thread.post, pagination)
      })().catch((err: unknown) => {
        if (createHttpError.isHttpError(err) && err.status === 400) return null
        throw err
      })
      if (!page) return { success: false, error: 'Invalid cursor' }
      const posts = await getPostsOrDeletedCommentStubs(page.ids)
      return {
        success: true,
        descendants: await toMcpPosts(
          posts.filter((post): post is Post => Boolean(post)),
          { viewer: thread.viewer },
        ),
        page_info: page.pageInfo,
      }
    },
}

export default tool
