import type { BasicUser } from '@services/users/types'
import type { Tool } from '@services/openai-agents/tool-types'
import { resolveReadableThread } from './mcp-post-access.mts'
import { mcpPostSchema, toMcpPost, type McpPost } from './mcp-post-output.mts'
import { foundOrNotFoundSchema } from './read-tool-output-schema.mts'

type ToolArgs = {
  post_id: string
}

type ToolResult = { success: true; post: McpPost } | { success: false; error: string }

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_post',
    type: 'function',
    description:
      'Get one post, comment or story post by its UUID or slug. Only public content is readable: a private, pending, deleted, missing or otherwise hidden post returns { success: false, error: "Post not found" }. A comment is readable only when its whole thread is. Use get_post_ancestors to walk up a thread and get_post_descendants to read its replies.',
    parameters: {
      type: 'object',
      properties: {
        post_id: { type: 'string', description: 'Post UUID or slug' },
      },
      required: ['post_id'],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'Get Post',
    requiredScopes: { mcp: ['posts:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/posts/:idOrSlug' }],
    outputSchema: foundOrNotFoundSchema({ post: mcpPostSchema() }),
  },
  function:
    (currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const thread = await resolveReadableThread(currentUser, args.post_id)
      if (!thread) return { success: false, error: 'Post not found' }
      return { success: true, post: await toMcpPost(thread.post) }
    },
}

export default tool
