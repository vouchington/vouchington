import { getCommunityOrThrow, joinCommunity } from '@services/communities'
import type { Tool } from '@services/openai-agents/tool-types'
import { successSchema } from './output-schema-shapes.mts'
import { requireActiveToolUser } from './private-user.mts'

type Args = { community_id: string }
type Result = { success: true; community_id: string }

const tool: Tool<Args, Result> = {
  schema: {
    name: 'join_community',
    type: 'function',
    description:
      'Join a public community as a member, by its UUID or slug. Joining a private community needs an invitation or an application (apply_to_community). The call is refused with CONFLICT if the current user is already a member, and with FORBIDDEN if the community is archived or private, the user is banned from it, or it is temporarily limited to approved members. Returns the community_id.',
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
    title: 'Join Community',
    plan: 'plus',
    requiredScopes: { mcp: ['communities:read', 'communities:write'] },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    api: [{ method: 'POST', path: '/api/v1/communities/:idOrSlug/members' }],
    outputSchema: successSchema({ community_id: { type: 'string', format: 'uuid' } }),
  },
  function: currentUser => async args =>
    join((await requireActiveToolUser(currentUser)).id, args.community_id),
}

async function join(userId: string, communityIdOrSlug: string): Promise<Result> {
  const community = await getCommunityOrThrow(communityIdOrSlug)
  await joinCommunity(userId, community.id)
  return { success: true, community_id: community.id }
}

export default tool
