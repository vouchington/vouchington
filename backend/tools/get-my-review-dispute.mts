import assert from 'http-assert'
import type { Tool } from '@services/openai-agents/tool-types'
import { getReviewDisputeByIdFromPrimary } from '@services/review-disputes/get'
import { DISPUTE_SCHEMA, toMcpDispute, type McpDispute } from './mcp-case-output.mts'
import { successSchema } from './output-schema-shapes.mts'
import { requirePrivateToolUser } from './private-user.mts'

type Args = { dispute_id: string }
type Result = { success: true; dispute: McpDispute }

const tool: Tool<Args, Result> = {
  schema: {
    name: 'get_my_review_dispute',
    type: 'function',
    description:
      "Get one review dispute the current user filed, by id: the post_id and topic_id it disputes, the reason code, its status, is_overdue while pending, the resolution_action once decided, and the moderators' public_response, fenced as external content, once it was sent. The call is refused with NOT_FOUND for an unknown id and with FORBIDDEN for another user's dispute.",
    parameters: {
      type: 'object',
      properties: {
        dispute_id: { type: 'string', format: 'uuid', description: 'The ID of the dispute.' },
      },
      required: ['dispute_id'],
      additionalProperties: false,
    },
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Get My Review Dispute',
    requiredScopes: { mcp: ['disputes:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/disputes/:id' }],
    outputSchema: successSchema({ dispute: DISPUTE_SCHEMA }),
  },
  function: currentUser => async args => {
    const user = await requirePrivateToolUser(currentUser)
    const dispute = await getReviewDisputeByIdFromPrimary(args.dispute_id)
    assert(dispute, 404, 'Dispute not found')
    assert(dispute.disputant_user_id === user.id, 403, 'Forbidden')
    return { success: true, dispute: await toMcpDispute(dispute) }
  },
}

export default tool
