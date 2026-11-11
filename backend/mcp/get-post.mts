import type { MergedToolSource } from './create-merged-tool.mts'
import { postReferenceSchema } from './entity-reference-schema.mts'
import type { BasicUser } from '@services/users/types'
import { resolveReadableThread } from './mcp-post-access.mts'
import { mcpPostSchema, toMcpPosts, type McpPost } from './mcp-post-output.mts'
import { foundOrNotFoundSchema } from './read-tool-output-schema.mts'

type ToolArgs = {
  post_id: string
}

type ToolResult = { success: true; post: McpPost } | { success: false; error: string }

const tool: MergedToolSource<ToolArgs, ToolResult> = {
  schema: {
    description:
      'Read id/slug with REST viewer access. Hidden/missing/deleted: Post not found. Deleted/unmoderated comments with replies are placeholders unless viewer access permits their content.',
    parameters: {
      type: 'object',
      properties: {
        post_id: postReferenceSchema,
      },
      required: ['post_id'],
    },
  },
  meta: {
    audience: 'user',
    title: 'Get Post',
    requiredScopes: ['posts:read'],
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/posts/:idOrSlug' }],
    outputSchema: foundOrNotFoundSchema({ post: mcpPostSchema(true) }),
  },
  function:
    (currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const thread = await resolveReadableThread(currentUser, args.post_id)
      if (!thread) return { success: false, error: 'Post not found' }
      return {
        success: true,
        post: (await toMcpPosts([thread.post], { details: true, viewer: thread.viewer }))[0]!,
      }
    },
}

export default tool
