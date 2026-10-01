import { sanitizePromptInjection } from '@jongleberry/vurst-prompt'
import { searchCommunityMembers, type CommunityMemberRole } from '@services/communities'
import { getUserPublicByAnyCachedBatch } from '@services/entity-fetch'
import type { BasicUser } from '@services/users/types'
import type { Tool } from './types.mts'
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
import { nullable } from './output-schema-shapes.mts'
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

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_community_members',
    type: 'function',
    description: `List the members of a public community by its UUID or slug, as a signed-out reader sees the roster: the owner and moderators always, and regular members only when the community lets the public see them (member_roster_visibility: public). Returns at most ${max} members per page and page_info.end_cursor; pass it as after to get the next page. A private, deleted or unknown community returns { success: false, error: "Community not found" }. A malformed cursor returns { success: false, error: "Invalid cursor" }.`,
    parameters: {
      type: 'object',
      properties: {
        community_id: { type: 'string', description: 'Community UUID or slug' },
        role: {
          type: 'string',
          enum: [...MEMBER_ROLES],
          description: 'Only members with this role',
        },
        ...communityPageInputProperties('Members'),
      },
      required: ['community_id'],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'Get Community Members',
    requiredScopes: { mcp: ['communities:read'] },
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
