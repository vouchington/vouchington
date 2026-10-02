import assert from 'http-assert'
import {
  resolveReviewDisputeRemove,
  resolveReviewDisputeAnnotate,
  dismissReviewDispute,
} from '@services/review-disputes'
import { createAdminTool, adminInput, UUID_INPUT, TEXT_INPUT } from './create-admin-tool.mts'
import { adminRouteOutputSchema } from './output-schema.mts'

export const resolveReviewDisputeTool = createAdminTool<{
  id: string
  action: 'remove' | 'annotate' | 'dismiss'
  body_text?: string
}>({
  name: 'resolve_review_dispute',
  description:
    'Resolve a delivered dispute. Agent decisions are audited without creating training feedback.',
  scope: 'moderation:approve',
  api: { method: 'POST', path: '/api/v1/disputes/:id/resolution' },
  parameters: adminInput(
    {
      id: UUID_INPUT,
      action: { type: 'string', enum: ['remove', 'annotate', 'dismiss'] },
      body_text: TEXT_INPUT,
    },
    ['id', 'action'],
  ),
  outputSchema: adminRouteOutputSchema(
    { method: 'POST', path: '/api/v1/disputes/:id/resolution' },
    'staff',
  ),
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  run: async (user, { id, action, body_text }) => {
    if (action === 'annotate') assert(body_text, 422, 'body_text is required for annotate')
    return {
      dispute: await (action === 'remove'
        ? resolveReviewDisputeRemove(user.id, id, 'agent')
        : action === 'annotate'
          ? resolveReviewDisputeAnnotate(user.id, id, body_text!, 'agent')
          : dismissReviewDispute(user.id, id, 'agent')),
    }
  },
})
