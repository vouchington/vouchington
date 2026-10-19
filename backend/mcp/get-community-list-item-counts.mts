import type { MergedToolSource } from './create-merged-tool.mts'
import { communityReferenceSchema } from './entity-reference-schema.mts'
import { getCommunityListItemCounts } from '@services/communities'
import type { BasicUser } from '@services/users/types'
import { COMMUNITY_LIST_ITEM_TYPES } from './mcp-community-list-item-output.mts'
import { COMMUNITY_NOT_FOUND, loadPublicCommunity } from './mcp-community-output.mts'
import { foundOrNotFoundSchema, pickProperties } from './read-tool-output-schema.mts'

type ToolArgs = { community_id: string }

type ToolResult =
  | ({ success: true } & Record<(typeof COMMUNITY_LIST_ITEM_TYPES)[number], number>)
  | typeof COMMUNITY_NOT_FOUND

const tool: MergedToolSource<ToolArgs, ToolResult> = {
  schema: {
    description:
      "Count a public community's curated list entries by item_type (topic, rss_feed, post, url_hostname or url). Counts reflect the signed-out view: unreadable posts are excluded. Use read_community (option list_items) to page through them.",
    parameters: {
      type: 'object',
      properties: { community_id: communityReferenceSchema },
      required: ['community_id'],
    },
  },
  meta: {
    audience: 'user',
    title: 'Get Community List Item Counts',
    requiredScopes: ['communities:read'],
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
