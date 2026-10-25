import type { MergedToolSource } from './create-merged-tool.mts'
import { communityReferenceSchema } from './entity-reference-schema.mts'
import { sanitizePromptInjection } from '@jongleberry/vurst-prompt'
import { searchCommunityMembers, type CommunityMemberRole } from '@services/communities'
import { getUserPublicByAnyCachedBatch } from '@services/entity-fetch'
import type { BasicUser } from '@services/users/types'
import {
  COMMUNITY_NOT_FOUND,
  COMMUNITY_PAGE_LIMIT,
  communityPageInfoSchema,
  communityPageInputProperties,
  loadPublicCommunity,
} from './mcp-community-output.mts'
import {
  findPageOrNull,
  INVALID_CURSOR_RESULT,
  type InvalidCursorResult,
  type SearchPageInfo,
} from './paged-search.mts'
import { nullable } from '@vouchington/mcp-server/schema'
import { closedObject, foundOrNotFoundSchema, pickProperties } from './read-tool-output-schema.mts'
import { clampToolLimit } from './search-system.mts'

const MEMBER_ROLES = [
  'owner',
  'moderator',
  'member',
] as const satisfies readonly CommunityMemberRole[]

type ToolArgs = {
  community_id: string
  role?: CommunityMemberRole
  limit?: number
  after?: string
}

type McpCommunityMember = {
  user_id: string
  username: string | null
  role: CommunityMemberRole
  created_at: string
}

type ToolResult =
  | { success: true; results: McpCommunityMember[]; page_info: SearchPageInfo }
  | typeof COMMUNITY_NOT_FOUND
  | InvalidCursorResult

const { default: defaultLimit, max } = COMMUNITY_PAGE_LIMIT

const tool: MergedToolSource<ToolArgs, ToolResult> = {
  schema: {
    description:
      "List a public community's members as a signed-out reader sees them: owner and moderators always, regular members only when member_roster_visibility is public.",
    parameters: {
      type: 'object',
      properties: {
        community_id: communityReferenceSchema,
        role: {
          type: 'string',
          enum: [...MEMBER_ROLES],
        },
        ...communityPageInputProperties('Members'),
      },
      required: ['community_id'],
    },
  },
  meta: {
    audience: 'user',
    title: 'Get Community Members',
    requiredScopes: ['communities:read'],
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/communities/:idOrSlug/members' }],
    outputSchema: foundOrNotFoundSchema({
      results: {
        type: 'array',
        items: closedObject({
          ...pickProperties('CommunityMember', ['user_id']),
          username: nullable({ type: 'string' }),
          ...pickProperties('CommunityMember', ['role', 'created_at']),
        }),
      },
      page_info: communityPageInfoSchema(),
    }),
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const community = await loadPublicCommunity(args.community_id)
      if (!community) return COMMUNITY_NOT_FOUND
      const page = await findPageOrNull(args.after, () =>
        searchCommunityMembers(community.id, {
          currentUser: null,
          viewerMembership: null,
          rosterVisibility: community.member_roster_visibility,
          role: args.role,
          limit: clampToolLimit(args.limit, defaultLimit, max),
          after: args.after,
        }),
      )
      if (!page) return INVALID_CURSOR_RESULT
      const users = await getUserPublicByAnyCachedBatch(page.results.map(member => member.user_id))
      const usernames = new Map(users.flatMap(user => (user ? [[user.id, user.username]] : [])))
      return {
        success: true,
        results: await Promise.all(
          page.results.map(async member => {
            const username = usernames.get(member.user_id)
            return {
              user_id: member.user_id,
              username: username
                ? await sanitizePromptInjection(username, { isTitle: true })
                : null,
              role: member.role,
              created_at: new Date(member.created_at).toISOString(),
            }
          }),
        ),
        page_info: page.page_info,
      }
    },
}

export default tool
