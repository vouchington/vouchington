import {
  updateModerationAppealDraft,
  approveModerationAppeal,
  sendApprovedModerationAppealResolution,
  rerunModerationAppealResolutionDraft,
} from '@services/moderation-appeals'
import { createAdminTool, adminInput, UUID_INPUT, TEXT_INPUT } from './create-admin-tool.mts'
import { adminRouteOutputSchema } from './output-schema.mts'

export const adminAppealsLifecycleTools = [
  createAdminTool<{ id: string; public_response?: string; internal_notes?: string }>({
    name: 'draft_appeal_response',
    description: 'Draft appeal response.',
    scope: 'moderation:write',
    api: { method: 'PATCH', path: '/api/v1/appeals/:id' },
    parameters: adminInput(
      { id: UUID_INPUT, public_response: TEXT_INPUT, internal_notes: TEXT_INPUT },
      ['id'],
    ),
    outputSchema: adminRouteOutputSchema({ method: 'PATCH', path: '/api/v1/appeals/:id' }, 'staff'),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    run: async (user, args) => {
      return {
        appeal: await updateModerationAppealDraft(user.id, args.id, {
          publicResponse: args.public_response,
          internalNotes: args.internal_notes,
        }),
      }
    },
  }),
  createAdminTool<{ id: string }>({
    name: 'approve_appeal_response',
    description: 'Approve appeal response.',
    scope: 'moderation:approve',
    api: { method: 'POST', path: '/api/v1/appeals/:id/approval' },
    parameters: adminInput({ id: UUID_INPUT }, ['id']),
    outputSchema: adminRouteOutputSchema(
      { method: 'POST', path: '/api/v1/appeals/:id/approval' },
      'staff',
    ),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    run: async (user, args) => {
      return { appeal: await approveModerationAppeal(user.id, args.id) }
    },
  }),
  createAdminTool<{ id: string }>({
    name: 'deliver_appeal_response',
    description: 'Deliver appeal response.',
    scope: 'moderation:approve',
    api: { method: 'POST', path: '/api/v1/appeals/:id/delivery' },
    parameters: adminInput({ id: UUID_INPUT }, ['id']),
    outputSchema: adminRouteOutputSchema(
      { method: 'POST', path: '/api/v1/appeals/:id/delivery' },
      'staff',
    ),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    run: async (user, args) => {
      return { appeal: await sendApprovedModerationAppealResolution(user.id, args.id) }
    },
  }),
  createAdminTool<{ id: string }>({
    name: 'rerun_appeal_resolution_draft',
    description: 'Rerun appeal resolution draft.',
    scope: 'moderation:ai-rerun',
    api: { method: 'POST', path: '/api/v1/appeals/:id/resolution-drafts' },
    parameters: adminInput({ id: UUID_INPUT }, ['id']),
    outputSchema: adminRouteOutputSchema(
      { method: 'POST', path: '/api/v1/appeals/:id/resolution-drafts' },
      'staff',
    ),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    run: async (user, args) => {
      await rerunModerationAppealResolutionDraft(user.id, args.id)
      return { queued: true, rerun_by_id: user.id }
    },
  }),
]
