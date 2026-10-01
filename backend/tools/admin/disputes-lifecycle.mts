import {
  updateReviewDisputeDraft,
  approveReviewDispute,
  sendApprovedReviewDisputeResolution,
} from '@services/review-disputes'
import { rerunReviewDisputeResolutionDraft } from '@services/review-disputes/rerun-resolution-draft'
import { createAdminTool, adminInput, UUID_INPUT, TEXT_INPUT } from './create-admin-tool.mts'
import { adminRouteOutputSchema } from './output-schema.mts'

export const adminDisputesLifecycleTools = [
  createAdminTool<{ id: string; public_response?: string; internal_notes?: string }>({
    name: 'draft_dispute_response',
    description: 'Draft dispute response.',
    scope: 'moderation:write',
    api: { method: 'PATCH', path: '/api/v1/disputes/:id' },
    parameters: adminInput(
      { id: UUID_INPUT, public_response: TEXT_INPUT, internal_notes: TEXT_INPUT },
      ['id'],
    ),
    outputSchema: adminRouteOutputSchema(
      { method: 'PATCH', path: '/api/v1/disputes/:id' },
      'staff',
    ),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    run: async (user, args) => {
      return {
        dispute: await updateReviewDisputeDraft(user.id, args.id, {
          publicResponse: args.public_response,
          internalNotes: args.internal_notes,
        }),
      }
    },
  }),
  createAdminTool<{ id: string }>({
    name: 'approve_dispute_response',
    description: 'Approve dispute response.',
    scope: 'moderation:approve',
    api: { method: 'POST', path: '/api/v1/disputes/:id/approval' },
    parameters: adminInput({ id: UUID_INPUT }, ['id']),
    outputSchema: adminRouteOutputSchema(
      { method: 'POST', path: '/api/v1/disputes/:id/approval' },
      'staff',
    ),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    run: async (user, args) => {
      return { dispute: await approveReviewDispute(user.id, args.id) }
    },
  }),
  createAdminTool<{ id: string }>({
    name: 'deliver_dispute_response',
    description: 'Deliver dispute response.',
    scope: 'moderation:approve',
    api: { method: 'POST', path: '/api/v1/disputes/:id/delivery' },
    parameters: adminInput({ id: UUID_INPUT }, ['id']),
    outputSchema: adminRouteOutputSchema(
      { method: 'POST', path: '/api/v1/disputes/:id/delivery' },
      'staff',
    ),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    run: async (user, args) => {
      return { dispute: await sendApprovedReviewDisputeResolution(user.id, args.id) }
    },
  }),
  createAdminTool<{ id: string }>({
    name: 'rerun_dispute_resolution_draft',
    description: 'Rerun dispute resolution draft.',
    scope: 'moderation:ai-rerun',
    api: { method: 'POST', path: '/api/v1/disputes/:id/resolution-drafts' },
    parameters: adminInput({ id: UUID_INPUT }, ['id']),
    outputSchema: adminRouteOutputSchema(
      { method: 'POST', path: '/api/v1/disputes/:id/resolution-drafts' },
      'staff',
    ),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    run: async (user, args) => {
      await rerunReviewDisputeResolutionDraft(user.id, args.id)
      return { queued: true, rerun_by_id: user.id }
    },
  }),
]
