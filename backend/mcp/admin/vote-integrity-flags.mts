import {
  getVoteIntegrityFlags,
  resolveVoteIntegrityFlag,
  INTEGRITY_FLAG_STATUSES,
  type IntegrityFlagStatus,
} from '@services/vote-integrity'
import { createAdminTool, adminInput, UUID_INPUT, PAGE_INPUT } from './create-admin-tool.mts'
import { adminRouteOutputSchema } from './output-schema.mts'

export const adminVoteIntegrityFlagTools = [
  createAdminTool<{ status?: IntegrityFlagStatus; after?: string; limit?: number }>({
    name: 'list_vote_integrity_flags',
    description: 'Page integrity flags with optional status.',
    scope: 'account-enforcement:read',
    api: { method: 'GET', path: '/api/v1/vote-integrity/flags' },
    parameters: adminInput({
      ...PAGE_INPUT,
      status: { type: 'string', enum: INTEGRITY_FLAG_STATUSES },
    }),
    outputSchema: adminRouteOutputSchema({ method: 'GET', path: '/api/v1/vote-integrity/flags' }),
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: (_user, args) => getVoteIntegrityFlags(args),
  }),
  createAdminTool<{ id: string; resolution: 'dismissed' }>({
    name: 'review_vote_integrity_flag',
    description: 'Dismiss an unresolved integrity flag.',
    scope: 'account-enforcement:write',
    api: { method: 'PATCH', path: '/api/v1/vote-integrity/flags/:id' },
    parameters: adminInput(
      { id: UUID_INPUT, resolution: { type: 'string', enum: ['dismissed'] } },
      ['id', 'resolution'],
    ),
    outputSchema: adminRouteOutputSchema({
      method: 'PATCH',
      path: '/api/v1/vote-integrity/flags/:id',
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    run: async (user, args) => ({
      flag: await resolveVoteIntegrityFlag(args.id, user.id, args.resolution),
    }),
  }),
]
