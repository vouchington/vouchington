import {
  listPendingTopicClaims,
  adminVerifyTopicClaim,
  rejectTopicClaim,
  revokeTopicClaim,
} from '@services/topic-claims'
import { createAdminTool, adminInput, UUID_INPUT, TEXT_INPUT } from './create-admin-tool.mts'
import { adminRouteOutputSchema } from './output-schema.mts'

const root = '/api/v1/admin/topic-claims'
export const adminTopicClaimTools = [
  createAdminTool<Record<string, never>>({
    name: 'list_pending_topic_claims',
    description: 'List pending claims without domain verification secrets.',
    scope: 'moderation:read',
    api: { method: 'GET', path: root },
    parameters: adminInput({}),
    outputSchema: adminRouteOutputSchema({ method: 'GET', path: root }),
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async () => ({ claims: await listPendingTopicClaims() }),
  }),
  createAdminTool<{ id: string }>({
    name: 'verify_topic_claim',
    description: 'Verify a pending topic claim.',
    scope: 'moderation:approve',
    api: { method: 'POST', path: `${root}/:id/verification` },
    parameters: adminInput({ id: UUID_INPUT }, ['id']),
    outputSchema: adminRouteOutputSchema({ method: 'POST', path: `${root}/:id/verification` }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    run: async (user, { id }) => ({ claim: await adminVerifyTopicClaim(user.id, id) }),
  }),
  createAdminTool<{ id: string; rejection_reason: string }>({
    name: 'reject_topic_claim',
    description: 'Reject a pending topic claim with a reason.',
    scope: 'moderation:write',
    api: { method: 'POST', path: `${root}/:id/rejection` },
    parameters: adminInput({ id: UUID_INPUT, rejection_reason: TEXT_INPUT }, [
      'id',
      'rejection_reason',
    ]),
    outputSchema: adminRouteOutputSchema({ method: 'POST', path: `${root}/:id/rejection` }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    run: async (user, { id, rejection_reason }) => ({
      claim: await rejectTopicClaim(user.id, id, rejection_reason),
    }),
  }),
  createAdminTool<{ id: string; revocation_reason: string }>({
    name: 'revoke_topic_claim',
    description: 'Revoke a verified topic claim with a reason.',
    scope: 'moderation:write',
    api: { method: 'POST', path: `${root}/:id/revocation` },
    parameters: adminInput({ id: UUID_INPUT, revocation_reason: TEXT_INPUT }, [
      'id',
      'revocation_reason',
    ]),
    outputSchema: adminRouteOutputSchema({ method: 'POST', path: `${root}/:id/revocation` }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    run: async (user, { id, revocation_reason }) => ({
      claim: await revokeTopicClaim(user.id, id, revocation_reason),
    }),
  }),
]
