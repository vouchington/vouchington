import type { MergedToolSource } from './create-merged-tool.mts'
import {
  COMMENT_DESCENDANTS_LIMIT,
  getCommentDescendantsPage,
  type CommentDescendantsPage,
} from '@services/comments'
import { getPostByAnyCachedBatch } from '@services/entity-fetch'
import type { Post } from '@services/posts'
import type { BasicUser } from '@services/users/types'
import createHttpError from 'http-errors'
import { resolveReadableThread } from './mcp-post-access.mts'
import { mcpPostSchema, toMcpPosts, type McpPost } from './mcp-post-output.mts'
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

const tool: MergedToolSource<ToolArgs, ToolResult> = {
  schema: {
    description:
      "Get a post's replies in id order. An unreadable reply hides its subtree; a deleted reply is omitted but its descendants remain, so parent_post_id may name an unlisted reply. A deleted, missing or not fully public post returns Post not found.",
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
      const page = await getCommentDescendantsPage(null, thread.post, {
        limit: clampToolLimit(args.limit, defaultLimit, max),
        after: args.after,
      }).catch((err: unknown) => {
        if (createHttpError.isHttpError(err) && err.status === 400) return null
        throw err
      })
      if (!page) return { success: false, error: 'Invalid cursor' }
      const posts = await getPostByAnyCachedBatch(page.ids)
      return {
        success: true,
        descendants: await toMcpPosts(posts.filter((post): post is Post => Boolean(post))),
        page_info: page.pageInfo,
      }
    },
}

export default tool
