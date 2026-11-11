import type { MergedToolSource } from './create-merged-tool.mts'
import { postReferenceSchema } from './entity-reference-schema.mts'
import type { BasicUser } from '@services/users/types'
import { resolveReadableThread } from './mcp-post-access.mts'
import { mcpPostSchema, toMcpPosts, type McpPost } from './mcp-post-output.mts'
import type { Post } from '@services/posts/types'
import { foundOrNotFoundSchema, pickProperties } from './read-tool-output-schema.mts'

type ToolArgs = {
  post_id: string
}

type DetailedPost = McpPost & Pick<Post, 'data_point_vertical' | 'structured_data'>

const postSchema = mcpPostSchema(true)
const dataPointFields = ['data_point_vertical', 'structured_data'] as const
const detailsSchema = {
  ...postSchema,
  properties: {
    ...(postSchema['properties'] as Record<string, Record<string, unknown>>),
    ...pickProperties('Post', dataPointFields),
  },
  required: [...(postSchema['required'] as string[]), ...dataPointFields],
}

type ToolResult = { success: true; post: DetailedPost } | { success: false; error: string }

const tool: MergedToolSource<ToolArgs, ToolResult> = {
  schema: {
    description:
      'Read details/structured data by id/slug with REST viewer access. Hidden/missing/deleted: Post not found. Deleted/unmoderated comments with replies are placeholders unless viewer access permits their content.',
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
    outputSchema: foundOrNotFoundSchema({ post: detailsSchema }),
  },
  function:
    (currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const thread = await resolveReadableThread(currentUser, args.post_id)
      if (!thread) return { success: false, error: 'Post not found' }
      const post = (await toMcpPosts([thread.post], { details: true, viewer: thread.viewer }))[0]!
      return {
        success: true,
        post: {
          ...post,
          data_point_vertical: post.placeholder_state
            ? null
            : (thread.post.data_point_vertical ?? null),
          structured_data: post.placeholder_state ? null : (thread.post.structured_data ?? null),
        },
      }
    },
}

export default tool
