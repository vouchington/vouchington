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
import { mcpPostSchema, toMcpPosts, type McpPost } from './mcp-post-output.mts'
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
      'Page immediate-child heads in id order with bounded reply previews. Each response is id-ordered, but pages are not a global descendant-id sequence. Continue with page_info.end_cursor even when a page is short or empty; the cursor advances past inspected heads. has_next_page refers to more heads, not omitted preview replies. To expand any returned comment, call this same option with that comment as post_id. Deleted or unmoderated replies are content-free placeholders when needed to preserve a possible valid branch. A missing or not fully public post returns Post not found.',
    parameters: {
      type: 'object',
      properties: {
        post_id: postReferenceSchema,
        limit: {
          type: 'integer',
          minimum: min,
          description: `Maximum replies returned per page, clamped to the runtime limit up to ${max} (static default: ${defaultLimit}). A preview may return fewer.`,
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
      // The signed-out page is the owner's page minus what private visibility adds (see
      // resolveReadableThread), and its cursors are scoped to the thread, never to a viewer.
      const page = await (async () => {
        const pagination = parseCommentDescendantPagination({
          limit: args.limit,
          after: args.after,
        })
        return getCommentDescendantsPage(null, thread.post, pagination)
      })().catch((err: unknown) => {
        if (createHttpError.isHttpError(err) && err.status === 400) return null
        throw err
      })
      if (!page) return { success: false, error: 'Invalid cursor' }
      const posts = await getPostsOrDeletedCommentStubs(page.ids)
      return {
        success: true,
        descendants: await toMcpPosts(posts.filter((post): post is Post => Boolean(post))),
        page_info: page.pageInfo,
      }
    },
}

export default tool
