import { admitDelegatedCreate } from '@services/contribution-gating/admit-delegated-create'
import type { Tool } from '@services/openai-agents/tool-types'
import { createReviewDispute, parseCreateReviewDisputeInput } from '@services/review-disputes'
import { REVIEW_DISPUTE_REASONS } from '@ts-shared/utils/moderation-catalogs'
import { getDelegatedToolAuthority } from './delegated-authority.mts'
import { DISPUTE_SCHEMA, toMcpDispute, type McpDispute } from './mcp-case-output.mts'
import { successSchema } from './output-schema-shapes.mts'
import { requireActiveToolUser } from './private-user.mts'

type Args = {
  idempotency_key: string
  post_id: string
  reason: string
  claim_text: string
  topic_id?: string
}

type Result = { success: true; dispute: McpDispute; is_duplicate: boolean }

const tool: Tool<Args, Result> = {
  schema: {
    name: 'create_review_dispute',
    type: 'function',
    description:
      'Dispute a review of a topic the current user has a verified claim on. post_id is the review; topic_id selects a rated topic and defaults to the first. claim_text is the case for moderators, at most 4000 characters. An open dispute is updated (is_duplicate true). Invalid or removed reviews are refused; no verified claim returns FORBIDDEN. Read the outcome with read_my_review_disputes (option get).',
    parameters: {
      type: 'object',
      properties: {
        idempotency_key: {
          type: 'string',
          format: 'uuid',
        },
        post_id: { type: 'string', format: 'uuid' },
        reason: { type: 'string', enum: [...REVIEW_DISPUTE_REASONS] },
        claim_text: { type: 'string', description: 'The case for the moderators.' },
        topic_id: {
          type: 'string',
          format: 'uuid',
        },
      },
      required: ['idempotency_key', 'post_id', 'reason', 'claim_text'],
      additionalProperties: false,
    },
    strict: null,
  },
  meta: {
    audience: 'user',
    title: 'Dispute Review',
    plan: 'plus',
    requiredScopes: ['disputes:read', 'disputes:write'],
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    api: [{ method: 'POST', path: '/api/v1/disputes' }],
    outputSchema: successSchema({ dispute: DISPUTE_SCHEMA, is_duplicate: { type: 'boolean' } }),
  },
  function: currentUser => async (args, invocationContext) => {
    const user = await requireActiveToolUser(currentUser)
    const authority = getDelegatedToolAuthority(user, invocationContext)
    const input = parseCreateReviewDisputeInput({
      post_id: args.post_id,
      reason: args.reason,
      claim_text: args.claim_text,
      topic_id: args.topic_id,
    })
    return admitDelegatedCreate({
      authority,
      currentUser: user,
      idempotencyKey: args.idempotency_key,
      route: 'disputes.create',
      scope: 'global',
      intent: { input },
      execute: async query => {
        const { dispute, isDuplicate } = await createReviewDispute(user, input, { query })
        return {
          success: true as const,
          dispute: await toMcpDispute(dispute),
          is_duplicate: isDuplicate,
        }
      },
    })
  },
}

export default tool
