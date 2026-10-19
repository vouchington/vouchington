import { leaveCommunity, loadCommunityWithViewer } from '@services/communities'
import { communityReferenceSchema } from './entity-reference-schema.mts'
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
      'Leave a community by UUID or slug. Rejoining a private one requires a new invitation or application. Nonmembers get NOT_FOUND; owners must transfer ownership first (INVALID_INPUT); archived communities return FORBIDDEN.',
    parameters: {
      type: 'object',
      properties: {
        community_id: communityReferenceSchema,
      },
      required: ['community_id'],
      additionalProperties: false,
    },
    strict: null,
  },
  meta: {
    audience: 'user',
    title: 'Leave Community',
    plan: 'plus',
    requiredScopes: ['communities:read', 'communities:write'],
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    api: [{ method: 'DELETE', path: '/api/v1/communities/:idOrSlug/members' }],
    outputSchema: successSchema({ community_id: { type: 'string', format: 'uuid' } }),
  },
  function: currentUser => async args =>
    leave((await requireActiveToolUser(currentUser)).id, args.community_id),
}

async function leave(userId: string, communityIdOrSlug: string): Promise<Result> {
  const loaded = await loadCommunityWithViewer(communityIdOrSlug, userId)
  await leaveCommunity(userId, loaded)
  return { success: true, community_id: loaded.community.id }
}

export default tool
