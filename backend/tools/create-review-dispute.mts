import { runDelegatedCreate } from '@services/contribution-gating/run-delegated-create'
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
      'Dispute a review of a topic the current user holds a verified claim on, because the review is inaccurate or breaks the rules. post_id is the review post. topic_id picks which of its rated topics is disputed and defaults to the first. reason is one of the listed codes and claim_text is the case for the moderators, at most 4000 characters. The call is refused with NOT_FOUND for an unknown post, INVALID_INPUT when the post is not a review, has no rating for the topic or has been removed, and FORBIDDEN without a verified claim on the topic. Disputing a review that already has an open dispute from the user updates that dispute and returns is_duplicate true. Moderators decide the dispute; read the outcome with get_my_review_dispute. Reuse the same UUID idempotency_key and arguments to safely retry; the first result is replayed. Returns the dispute.',
    parameters: {
      type: 'object',
      properties: {
        idempotency_key: {
          type: 'string',
          format: 'uuid',
          description: 'A UUID for this dispute and its retries.',
        },
        post_id: { type: 'string', format: 'uuid', description: 'The ID of the review post.' },
        reason: { type: 'string', enum: [...REVIEW_DISPUTE_REASONS] },
        claim_text: { type: 'string', description: 'The case for the moderators.' },
        topic_id: {
          type: 'string',
          format: 'uuid',
          description: 'The disputed topic, when the review rates several.',
        },
      },
      required: ['idempotency_key', 'post_id', 'reason', 'claim_text'],
      additionalProperties: false,
    },
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Dispute Review',
    plan: 'plus',
    requiredScopes: { mcp: ['disputes:read', 'disputes:write'] },
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
    return runDelegatedCreate({
      authority,
      currentUser: user,
      idempotencyKey: args.idempotency_key,
      intent: { tool: 'create_review_dispute', input },
      execute: async () => {
        const { dispute, isDuplicate } = await createReviewDispute(user, input)
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
