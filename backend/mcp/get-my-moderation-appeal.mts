import type { MergedToolSource } from './create-merged-tool.mts'
import assert from 'http-assert'
import { getModerationAppealByIdFromPrimary } from '@services/moderation-appeals'
import { APPEAL_SCHEMA, toMcpAppeal, type McpAppeal } from './mcp-case-output.mts'
import { successSchema } from './output-schema-shapes.mts'
import { requirePrivateToolUser } from './private-user.mts'

type Args = { appeal_id: string }
type Result = { success: true; appeal: McpAppeal }

const tool: MergedToolSource<Args, Result> = {
  schema: {
    description:
      "Get a moderation appeal filed by the current user. target_type and target_id identify the decision; community_id and post_removal_kind appear when applicable. Includes status, overdue state, resolution_action and public_response. Unknown ids return NOT_FOUND; another user's appeal returns FORBIDDEN.",
    parameters: {
      type: 'object',
      properties: {
        appeal_id: { type: 'string', format: 'uuid' },
      },
      required: ['appeal_id'],
      additionalProperties: false,
    },
  },
  meta: {
    audience: 'user',
    title: 'Get My Moderation Appeal',
    requiredScopes: ['appeals:read'],
    suspendedAccess: true,
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
