import {
  getReportAbusePenalties,
  applyReportAbusePenalty,
  revokeReportAbusePenalty,
} from '@services/report-integrity'
import { createAdminTool, adminInput, UUID_INPUT, PAGE_INPUT } from './create-admin-tool.mts'
import { adminRouteOutputSchema } from './output-schema.mts'

type PenaltyQuery = {
  status?: 'active' | 'revoked'
  source?: 'flag'
  user_id?: string
  source_flag_id?: string
  after?: string
  limit?: number
}
export const adminReportIntegrityPenaltyTools = [
  createAdminTool<PenaltyQuery>({
    name: 'list_report_abuse_penalties',
    description: 'Page account penalties with scoped filters.',
    scope: 'account-enforcement:read',
    api: { method: 'GET', path: '/api/v1/report-integrity/penalties' },
    parameters: adminInput({
      ...PAGE_INPUT,
      status: { type: 'string', enum: ['active', 'revoked'] },
      user_id: UUID_INPUT,
      source_flag_id: UUID_INPUT,
    }),
    outputSchema: adminRouteOutputSchema({
      method: 'GET',
      path: '/api/v1/report-integrity/penalties',
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: (_user, args) => {
      const options = { ...args, userId: args.user_id, sourceFlagId: args.source_flag_id }
      return getReportAbusePenalties(options)
    },
  }),
  createAdminTool<{ id: string }>({
    name: 'apply_report_abuse_penalty',
    description: 'Apply penalties from an unresolved flag and resolve it atomically.',
    scope: 'account-enforcement:penalize',
    api: { method: 'POST', path: '/api/v1/report-integrity/flags/:id/penalties' },
    parameters: adminInput({ id: UUID_INPUT }, ['id']),
    outputSchema: adminRouteOutputSchema({
      method: 'POST',
      path: '/api/v1/report-integrity/flags/:id/penalties',
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    run: (user, args) => applyReportAbusePenalty(user.id, args.id),
  }),
  createAdminTool<{ id: string }>({
    name: 'lift_report_abuse_penalty',
    description: 'Revoke an active account penalty.',
    scope: 'account-enforcement:penalize',
    api: { method: 'DELETE', path: '/api/v1/report-integrity/penalties/:id' },
    parameters: adminInput({ id: UUID_INPUT }, ['id']),
    outputSchema: adminRouteOutputSchema({
      method: 'DELETE',
      path: '/api/v1/report-integrity/penalties/:id',
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    run: (user, args) => revokeReportAbusePenalty(user.id, args.id),
  }),
]
