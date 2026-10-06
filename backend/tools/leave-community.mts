import { getCommunityOrThrow, leaveCommunity } from '@services/communities'
import type { Tool } from '@services/openai-agents/tool-types'
import { successSchema } from './output-schema-shapes.mts'
import { requireActiveToolUser } from './private-user.mts'

type Args = { community_id: string }
type Result = { success: true; community_id: string }

const tool: Tool<Args, Result> = {
  schema: {
    name: 'leave_community',
    type: 'function',
    description:
      'Leave a community the current user is a member of, by its UUID or slug. Leaving ends the membership; a private community needs a new invitation or application to rejoin. The call is refused with NOT_FOUND if the user is not a member, with INVALID_INPUT if the user owns the community (transfer ownership first), and with FORBIDDEN if the community is archived. Returns the community_id.',
    parameters: {
      type: 'object',
      properties: {
        community_id: { type: 'string', description: 'Community UUID or slug' },
      },
      required: ['community_id'],
      additionalProperties: false,
    },
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Leave Community',
    plan: 'plus',
    requiredScopes: { mcp: ['communities:read', 'communities:write'] },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    api: [{ method: 'DELETE', path: '/api/v1/communities/:idOrSlug/members' }],
    outputSchema: successSchema({ community_id: { type: 'string', format: 'uuid' } }),
  },
  function: currentUser => async args =>
    leave((await requireActiveToolUser(currentUser)).id, args.community_id),
}

async function leave(userId: string, communityIdOrSlug: string): Promise<Result> {
  const community = await getCommunityOrThrow(communityIdOrSlug)
  await leaveCommunity(userId, community.id)
  return { success: true, community_id: community.id }
}

export default tool
