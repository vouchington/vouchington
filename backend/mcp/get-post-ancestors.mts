import type { MergedToolSource } from './create-merged-tool.mts'
import { postReferenceSchema } from './entity-reference-schema.mts'
import { COMMENT_ANCESTOR_PAGE_MAX_LIMIT, resolveCommentAncestorPage } from '@services/comments'
import { getPostsOrDeletedCommentStubs } from '@services/posts'
import type { BasicUser } from '@services/users/types'
import createHttpError from 'http-errors'
import { resolveReadableThread } from './mcp-post-access.mts'
import {
  mcpPostSchema,
  toMcpPostSummaries as toMcpPosts,
  type McpPostSummary as McpPost,
} from './mcp-post-output.mts'
import { closedObject, foundOrNotFoundSchema, pickProperties } from './read-tool-output-schema.mts'
import { clampToolLimit } from './search-system.mts'

type ToolArgs = {
  post_id: string
  limit?: number
  after?: string
}

type PageInfo = {
  has_next_page: boolean
  start_cursor: string | null
  end_cursor: string | null
}

type ToolResult =
  | { success: true; ancestors: McpPost[]; page_info: PageInfo }
  | { success: false; error: string }

const EMPTY_PAGE_INFO: PageInfo = { has_next_page: false, start_cursor: null, end_cursor: null }
const LIMIT = COMMENT_ANCESTOR_PAGE_MAX_LIMIT

const tool: MergedToolSource<ToolArgs, ToolResult> = {
  schema: {
    description:
      'Page root and nearest parents, root first/repeated. Use end_cursor as after for older parents. Roots have none. Deleted/unmoderated parents: placeholders; nonpublic/missing: Post not found.',
    parameters: {
      type: 'object',
      properties: {
        post_id: postReferenceSchema,
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: LIMIT,
          description: `Parents per page (default ${LIMIT})`,
        },
        after: { type: 'string' },
      },
      required: ['post_id'],
    },
  },
  meta: {
    audience: 'user',
    title: 'Get Post Ancestors',
    requiredScopes: ['posts:read'],
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/posts/:idOrSlug/ancestors' }],
    outputSchema: foundOrNotFoundSchema({
      ancestors: { type: 'array', items: mcpPostSchema() },
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
      if (thread.post.post_type !== 'comment') {
        return { success: true, ancestors: [], page_info: EMPTY_PAGE_INFO }
      }
      // A reply is readable when it and the root are, so an ancestor in the window is a valid
      // comment or a placeholder. The window itself is a bounded read, as in the REST twin.
      const page = await resolveCommentAncestorPage({
        after: args.after,
        limit: clampToolLimit(args.limit, LIMIT, LIMIT),
        target: thread.post,
      }).catch((err: unknown) => {
        if (createHttpError.isHttpError(err) && err.status === 400) return null
        throw err
      })
      if (!page) return { success: false, error: 'Invalid cursor' }
      const ids = page.ancestors.filter(node => node.id !== thread.post.id)
      const loaded = new Map(
        (await getPostsOrDeletedCommentStubs(ids.map(node => node.id))).flatMap(post =>
          post ? [[post.id, post] as const] : [],
        ),
      )
      return {
        success: true,
        ancestors: await toMcpPosts(
          ids.flatMap(node => loaded.get(node.id) ?? []),
          { viewer: thread.viewer },
        ),
        page_info: page.pageInfo,
      }
    },
}

export default tool
