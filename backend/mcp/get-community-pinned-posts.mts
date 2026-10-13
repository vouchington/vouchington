import type { MergedToolSource } from './create-merged-tool.mts'
import { getPinnedPosts } from '@services/communities'
import type { BasicUser } from '@services/users/types'
import { COMMUNITY_NOT_FOUND, loadPublicCommunity } from './mcp-community-output.mts'
import { loadMcpPosts, mcpPostSchema, type McpPost } from './mcp-post-output.mts'
import { foundOrNotFoundSchema } from './read-tool-output-schema.mts'

type ToolArgs = {
  community_id: string
}

type ToolResult = { success: true; pinned_posts: McpPost[] } | typeof COMMUNITY_NOT_FOUND

const tool: MergedToolSource<ToolArgs, ToolResult> = {
  schema: {
    description:
      'Get the posts a public community has pinned, in pin order, by its UUID or slug, as a signed-out reader sees them: an anonymous post never names its author, whoever asks. A pinned post the public cannot see is left out.',
    parameters: {
      type: 'object',
      properties: {
        community_id: { type: 'string', description: 'Community UUID or slug' },
      },
      required: ['community_id'],
    },
  },
  meta: {
    surfaces: ['internal', 'mcp'],
    title: 'Get Community Pinned Posts',
    requiredScopes: { mcp: ['communities:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/communities/:idOrSlug/pinned-posts' }],
    outputSchema: foundOrNotFoundSchema({
      pinned_posts: { type: 'array', items: mcpPostSchema() },
    }),
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const community = await loadPublicCommunity(args.community_id)
      if (!community) return COMMUNITY_NOT_FOUND
      const pins = await getPinnedPosts(community.id, null)
      return { success: true, pinned_posts: await loadMcpPosts(pins.map(pin => pin.post_id)) }
    },
}

export default tool
