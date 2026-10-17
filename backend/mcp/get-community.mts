import type { MergedToolSource } from './create-merged-tool.mts'
import { getCommunityMetrics } from '@services/communities'
import type { BasicUser } from '@services/users/types'
import {
  COMMUNITY_NOT_FOUND,
  loadPublicCommunity,
  mcpCommunityEntryProperties,
  toMcpCommunityEntries,
  type McpCommunityEntry,
} from './mcp-community-output.mts'
import { foundOrNotFoundSchema } from './read-tool-output-schema.mts'

type ToolArgs = {
  community_id: string
}

type ToolResult = ({ success: true } & McpCommunityEntry) | typeof COMMUNITY_NOT_FOUND

const tool: MergedToolSource<ToolArgs, ToolResult> = {
  schema: {
    description:
      'Get a public community by UUID or slug, including its rules, owner and public counts. Private, deleted and unknown communities all return Community not found, even for members or owners. Use read_community (options posts, pinned_posts, members) for its contents.',
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
    title: 'Get Community',
    requiredScopes: { mcp: ['communities:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/communities/:idOrSlug' }],
    outputSchema: foundOrNotFoundSchema(mcpCommunityEntryProperties()),
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const community = await loadPublicCommunity(args.community_id)
      if (!community) return COMMUNITY_NOT_FOUND
      const metrics = await getCommunityMetrics(community.id)
      const [entry] = await toMcpCommunityEntries([{ community, owner: community.owner, metrics }])
      return { success: true, ...entry! }
    },
}

export default tool
