import type { BasicUser } from '@services/users/types'
import type { Tool } from '@services/openai-agents/tool-types'
import { resolveReadableThread } from './mcp-post-access.mts'
import { mcpPostSchema, toMcpPost, type McpPost } from './mcp-post-output.mts'
import { foundOrNotFoundSchema } from './read-tool-output-schema.mts'

type ToolArgs = {
  post_id: string
}

type ToolResult = { success: true; ancestors: McpPost[] } | { success: false; error: string }

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_post_ancestors',
    type: 'function',
    description:
      'Get the parent chain of a comment by its UUID or slug, ordered from the thread root down to its direct parent and not including the comment itself. A root post has no ancestors. A deleted comment in the chain is left out, so a parent_id can name a comment that is not listed. A comment whose thread is not fully public, or that is deleted or missing, returns { success: false, error: "Post not found" }.',
    parameters: {
      type: 'object',
      properties: {
        post_id: { type: 'string', description: 'Post UUID or slug of the comment' },
      },
      required: ['post_id'],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
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
      return { success: true, ancestors: await Promise.all(thread.ancestors.map(toMcpPost)) }
    },
}

export default tool
