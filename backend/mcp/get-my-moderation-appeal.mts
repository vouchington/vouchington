import assert from 'http-assert'
import { getModerationAppealByIdFromPrimary } from '@services/moderation-appeals'
import type { Tool } from '@services/openai-agents/tool-types'
import { APPEAL_SCHEMA, toMcpAppeal, type McpAppeal } from './mcp-case-output.mts'
import { successSchema } from './output-schema-shapes.mts'
import { requirePrivateToolUser } from './private-user.mts'

type Args = { appeal_id: string }
type Result = { success: true; appeal: McpAppeal }

const tool: Tool<Args, Result> = {
  schema: {
    name: 'get_my_moderation_appeal',
    type: 'function',
    description:
      "Get one moderation appeal the current user filed, by id: its target_type and target_id (the warning, community ban, removed post or suspension it contests), the community_id and post_removal_kind where they apply, its status, is_overdue while pending, the resolution_action once decided, and the moderators' public_response, fenced as external content, once it was sent. The call is refused with NOT_FOUND for an unknown id and with FORBIDDEN for another user's appeal.",
    parameters: {
      type: 'object',
      properties: {
        appeal_id: { type: 'string', format: 'uuid', description: 'The ID of the appeal.' },
      },
      required: ['appeal_id'],
      additionalProperties: false,
    },
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Get My Moderation Appeal',
    requiredScopes: { mcp: ['appeals:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/appeals/:id' }],
    outputSchema: successSchema({ appeal: APPEAL_SCHEMA }),
  },
  function: currentUser => async args => {
    const user = await requirePrivateToolUser(currentUser)
    const appeal = await getModerationAppealByIdFromPrimary(args.appeal_id)
    assert(appeal, 404, 'Appeal not found')
    assert(appeal.appellant_user_id === user.id, 403, 'Forbidden')
    return { success: true, appeal: await toMcpAppeal(appeal) }
  },
}

export default tool
