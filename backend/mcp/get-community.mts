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
      'Get one community by its UUID or slug: its name, description, rules, owner and public counts. Only public communities are readable, for every caller: a private, deleted or unknown community returns { success: false, error: "Community not found" }, even to its own members, moderators and owner. Use read_community (option posts), read_community (option pinned_posts) and read_community (option members) to read inside it.',
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
