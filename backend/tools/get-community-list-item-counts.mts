import { getCommunityListItemCounts } from '@services/communities'
import type { Tool } from '@services/openai-agents/tool-types'
import type { BasicUser } from '@services/users/types'
import { COMMUNITY_LIST_ITEM_TYPES } from './mcp-community-list-item-output.mts'
import { COMMUNITY_NOT_FOUND, loadPublicCommunity } from './mcp-community-output.mts'
import { foundOrNotFoundSchema, pickProperties } from './read-tool-output-schema.mts'

type ToolArgs = { community_id: string }

type ToolResult =
  | ({ success: true } & Record<(typeof COMMUNITY_LIST_ITEM_TYPES)[number], number>)
  | typeof COMMUNITY_NOT_FOUND

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_community_list_item_counts',
    type: 'function',
    description:
      'Count the entries on a public community\'s curated list, by its UUID or slug, for each item_type: topic, rss_feed, post, url_hostname and url. The counts are what a signed-out reader sees, so post leaves out a post the public cannot see, and they match what get_community_list_items pages through. A private, deleted or unknown community returns { success: false, error: "Community not found" }.',
    parameters: {
      type: 'object',
      properties: { community_id: { type: 'string', description: 'Community UUID or slug' } },
      required: ['community_id'],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'Get Community List Item Counts',
    requiredScopes: { mcp: ['communities:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/communities/:idOrSlug/list-items/counts' }],
    outputSchema: foundOrNotFoundSchema(
      pickProperties('CommunityListItemCounts', COMMUNITY_LIST_ITEM_TYPES),
    ),
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const community = await loadPublicCommunity(args.community_id)
      if (!community) return COMMUNITY_NOT_FOUND
      return {
        success: true,
        ...(await getCommunityListItemCounts(community.id, { currentUser: null })),
      }
    },
}

export default tool
