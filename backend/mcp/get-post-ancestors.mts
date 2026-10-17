import type { MergedToolSource } from './create-merged-tool.mts'
import type { BasicUser } from '@services/users/types'
import { resolveReadableThread } from './mcp-post-access.mts'
import { mcpPostSchema, toMcpPosts, type McpPost } from './mcp-post-output.mts'
import { foundOrNotFoundSchema } from './read-tool-output-schema.mts'

type ToolArgs = {
  post_id: string
}

type ToolResult = { success: true; ancestors: McpPost[] } | { success: false; error: string }

const tool: MergedToolSource<ToolArgs, ToolResult> = {
  schema: {
    description:
      "Get a comment's parent chain from thread root to direct parent, excluding the comment. Root posts have none. Deleted ancestors are omitted, so parent_post_id may name an unlisted comment. A deleted, missing or not fully public comment returns Post not found.",
    parameters: {
      type: 'object',
      properties: {
        post_id: { type: 'string', description: 'Post UUID or slug of the comment' },
      },
      required: ['post_id'],
    },
  },
  meta: {
    surfaces: ['internal', 'mcp'],
    title: 'Get Post Ancestors',
    requiredScopes: { mcp: ['posts:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/posts/:idOrSlug/ancestors' }],
    outputSchema: foundOrNotFoundSchema({ ancestors: { type: 'array', items: mcpPostSchema() } }),
  },
  function:
    (currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const thread = await resolveReadableThread(currentUser, args.post_id)
      if (!thread) return { success: false, error: 'Post not found' }
      return { success: true, ancestors: await toMcpPosts(thread.ancestors) }
    },
}

export default tool
