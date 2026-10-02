import { rerunReportJudgement } from '@services/moderation-reports/rerun-judgement'
import { MODERATION_REPORT_STATUSES, resolveModerationReport } from '@services/moderation-reports'
import {
  listModerationReportPage,
  type ReportPageOptions,
} from '@services/moderation-reports/list-page'
import { createAdminTool, adminInput, UUID_INPUT, PAGE_INPUT } from './create-admin-tool.mts'
import { adminRouteOutputSchema } from './output-schema.mts'

const reportEndpoint = { method: 'GET', path: '/api/v1/reports' } as const
export const adminReportTools = [
  createAdminTool<ReportPageOptions>({
    name: 'list_moderation_reports',
    description: 'List staff moderation reports, optionally grouped by entity.',
    scope: 'moderation:read',
    api: reportEndpoint,
    parameters: adminInput({
      ...PAGE_INPUT,
      before: { type: 'string' },
      status: { type: 'string', enum: MODERATION_REPORT_STATUSES },
      sort: {
        type: 'string',
        enum: ['severity', 'most_reported', 'created_at_asc', 'created_at_desc'],
      },
      cluster: { type: 'string', enum: ['entity'] },
    }),
    outputSchema: {
      type: 'object',
      anyOf: [
        adminRouteOutputSchema(reportEndpoint, 'staff'),
        adminRouteOutputSchema(reportEndpoint, 'clustered'),
      ],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: (_user, args) => listModerationReportPage('staff', null, args),
  }),
  createAdminTool<{ id: string; status: 'reviewed' | 'dismissed' }>({
    name: 'resolve_moderation_report',
    description:
      'Close a pending report without creating training feedback from an agent decision.',
    scope: 'moderation:write',
    api: { method: 'PATCH', path: '/api/v1/reports/:id' },
    parameters: adminInput(
      { id: UUID_INPUT, status: { type: 'string', enum: ['reviewed', 'dismissed'] } },
      ['id', 'status'],
    ),
    outputSchema: adminRouteOutputSchema({ method: 'PATCH', path: '/api/v1/reports/:id' }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    run: async (user, args) => ({
      report: await resolveModerationReport(args.id, {
        status: args.status,
        resolvedById: user.id,
        trainingEvidence: 'agent',
      }),
    }),
  }),
  createAdminTool<{ id: string }>({
    name: 'rerun_report_judgement',
    description: 'Rerun the AI judgement for an existing report.',
    scope: 'moderation:ai-rerun',
    api: { method: 'POST', path: '/api/v1/reports/:id/judgements' },
    parameters: adminInput({ id: UUID_INPUT }, ['id']),
    outputSchema: adminRouteOutputSchema({
      method: 'POST',
      path: '/api/v1/reports/:id/judgements',
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    run: async (user, { id }) => {
      await rerunReportJudgement(user.id, id)
      return { queued: true, rerun_by_id: user.id }
    },
  }),
]
