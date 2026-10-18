import type { MergedToolSource } from './create-merged-tool.mts'
import assert from 'http-assert'
import { getReviewDisputeByIdFromPrimary } from '@services/review-disputes/get'
import { DISPUTE_SCHEMA, toMcpDispute, type McpDispute } from './mcp-case-output.mts'
import { successSchema } from './output-schema-shapes.mts'
import { requirePrivateToolUser } from './private-user.mts'

type Args = { dispute_id: string }
type Result = { success: true; dispute: McpDispute }

const tool: MergedToolSource<Args, Result> = {
  schema: {
    description:
      "Get a review dispute filed by the current user, including disputed post_id and topic_id, reason, status, overdue state, resolution_action and any public_response. Unknown ids return NOT_FOUND; another user's dispute returns FORBIDDEN.",
    parameters: {
      type: 'object',
      properties: {
        dispute_id: { type: 'string', format: 'uuid' },
      },
      required: ['dispute_id'],
      additionalProperties: false,
    },
  },
  meta: {
    audience: 'user',
    title: 'Get My Review Dispute',
    requiredScopes: ['disputes:read'],
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
