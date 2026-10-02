import {
  COMMENT_DESCENDANTS_LIMIT,
  getCommentDescendantsPage,
  type CommentDescendantsPage,
} from '@services/comments'
import { getPostByAnyCachedBatch } from '@services/entity-fetch'
import type { Post } from '@services/posts'
import type { BasicUser } from '@services/users/types'
import createHttpError from 'http-errors'
import type { Tool } from '@services/openai-agents/tool-types'
import { resolveReadableThread } from './mcp-post-access.mts'
import { mcpPostSchema, toMcpPost, type McpPost } from './mcp-post-output.mts'
import { closedObject, foundOrNotFoundSchema, pickProperties } from './read-tool-output-schema.mts'
import { clampToolLimit } from './search-system.mts'

type ToolArgs = {
  post_id: string
  limit?: number
  after?: string
}

type ToolResult =
  | { success: true; descendants: McpPost[]; page_info: CommentDescendantsPage['pageInfo'] }
  | { success: false; error: string }

const { min, max, default: defaultLimit } = COMMENT_DESCENDANTS_LIMIT

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_post_descendants',
    type: 'function',
    description: `Get the replies below a post by its UUID or slug, in id order, one cursor page at a time. Pass page_info.end_cursor as after to read the next page while page_info.has_next_page is true. A reply the public cannot see hides its whole subtree. A deleted reply is left out but the replies below it still appear, so a parent_id can name a reply that is not listed. A post that is not fully public, or that is deleted or missing, returns { success: false, error: "Post not found" }. A malformed or foreign cursor returns { success: false, error: "Invalid cursor" }. A page too large to return is refused, so lower the limit and try again.`,
    parameters: {
      type: 'object',
      properties: {
        post_id: { type: 'string', description: 'Post UUID or slug' },
        limit: {
          type: 'integer',
          minimum: min,
          maximum: max,
          description: `Replies per page, from ${min} to ${max} (default: ${defaultLimit})`,
        },
        after: { type: 'string', description: 'Opaque cursor from the previous page' },
      },
      required: ['post_id'],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'Get Post Descendants',
    requiredScopes: { mcp: ['posts:read'] },
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
      // The signed-out page is the owner's page minus what private visibility adds (see
      // resolveReadableThread), and its cursors are scoped to the thread, never to a viewer.
      const page = await getCommentDescendantsPage(null, thread.post, {
        limit: clampToolLimit(args.limit, defaultLimit, max),
        after: args.after,
      }).catch((error: unknown) => {
        if (createHttpError.isHttpError(error) && error.status === 400) return null
        throw error
      })
      if (!page) return { success: false, error: 'Invalid cursor' }
      const posts = await getPostByAnyCachedBatch(page.ids)
      return {
        success: true,
        descendants: await Promise.all(
          posts.filter((post): post is Post => Boolean(post)).map(toMcpPost),
        ),
        page_info: page.pageInfo,
      }
    },
}

export default tool
