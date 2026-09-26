import { isAdminUser } from '@services/users'
import type { BasicUser } from '@services/users/types'
import type { Tool } from './types.mts'
import { toolsSearchPostsSemantic } from '@services/posts/tools/semantic'
import { clampToolLimit } from './search-system.mts'

type ToolArgs = {
  query: string
  limit?: number
  post_type?: 'discussion' | 'review' | 'data_point' | 'comment' | 'link'
}

type ToolResult = {
  success: true
  results: Array<{
    id: string
    title: string
    markdown: string
    post_type: string
    distance: number
  }>
}

type SearchPostsSemanticToolDependencies = {
  toolsSearchPostsSemantic: typeof toolsSearchPostsSemantic
}

export function createSearchPostsSemanticTool(
  dependencies: Partial<SearchPostsSemanticToolDependencies> = {},
): Tool<ToolArgs, ToolResult> {
  const searchPostsSemantic = dependencies.toolsSearchPostsSemantic ?? toolsSearchPostsSemantic

  return {
    schema: {
      name: 'search_posts_semantic',
      type: 'function',
      description:
        'Search for posts using semantic similarity (vector embeddings). Best for finding conceptually related posts.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Natural language search query',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return (default: 5, max: 10)',
          },
          post_type: {
            type: 'string',
            enum: ['discussion', 'review', 'data_point', 'comment', 'link'],
            description: 'Filter by post type',
          },
        },
        required: ['query'],
      },
      strict: null,
    },
    meta: {
      surfaces: ['internal', 'mcp'],
      title: 'Search Posts by Meaning',
      requiredScopes: { mcp: ['posts:read'] },
      annotations: { readOnlyHint: true },
      api: [{ method: 'GET', path: '/api/v1/posts' }],
    },
    function:
      (currentUser: BasicUser) =>
      async (args: ToolArgs): Promise<ToolResult> => {
        const limit = clampToolLimit(args.limit, 5, 10)
        const results = await searchPostsSemantic({
          query: args.query,
          limit,
          postType: args.post_type,
          currentUserId: currentUser.id,
          isAdministrator: isAdminUser(currentUser),
        })
        return { success: true, results }
      },
  }
}

const tool = createSearchPostsSemanticTool()

export default tool
