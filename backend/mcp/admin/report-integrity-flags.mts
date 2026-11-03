import assert from 'http-assert'
import {
  getReportIntegrityFlagByIdFromPrimary,
  getReportIntegrityFlags,
  resolveReportIntegrityFlag,
  INTEGRITY_FLAG_STATUSES,
  type IntegrityFlagStatus,
} from '@services/report-integrity'
import { createAdminTool, adminInput, UUID_INPUT, PAGE_INPUT } from './create-admin-tool.mts'
import { adminRouteOutputSchema } from './output-schema.mts'

export const adminReportIntegrityFlagTools = [
  createAdminTool<{ status?: IntegrityFlagStatus; after?: string; limit?: number }>({
    name: 'list_report_integrity_flags',
    description: 'Page integrity flags with optional status.',
    scope: 'account-enforcement:read',
    api: { method: 'GET', path: '/api/v1/report-integrity/flags' },
    parameters: adminInput({
      ...PAGE_INPUT,
      status: { type: 'string', enum: INTEGRITY_FLAG_STATUSES },
    }),
    outputSchema: adminRouteOutputSchema({ method: 'GET', path: '/api/v1/report-integrity/flags' }),
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: (_user, args) => getReportIntegrityFlags(args),
  }),
  createAdminTool<{ id: string }>({
    name: 'get_report_integrity_flag',
    description: 'Read one integrity flag with its reporter ids.',
    scope: 'account-enforcement:read',
    api: { method: 'GET', path: '/api/v1/report-integrity/flags/:id' },
    parameters: adminInput({ id: UUID_INPUT }, ['id']),
    outputSchema: adminRouteOutputSchema({
      method: 'GET',
      path: '/api/v1/report-integrity/flags/:id',
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (_user, { id }) => {
      const flag = await getReportIntegrityFlagByIdFromPrimary(id)
      assert(flag, 404, 'Flag not found')
      return { flag }
    },
  }),
  createAdminTool<{ id: string; resolution: 'dismissed' }>({
    name: 'review_report_integrity_flag',
    description: 'Dismiss an unresolved integrity flag.',
    scope: 'account-enforcement:write',
    api: { method: 'PATCH', path: '/api/v1/report-integrity/flags/:id' },
    parameters: adminInput(
      { id: UUID_INPUT, resolution: { type: 'string', enum: ['dismissed'] } },
      ['id', 'resolution'],
    ),
    outputSchema: adminRouteOutputSchema({
      method: 'PATCH',
      path: '/api/v1/report-integrity/flags/:id',
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    run: async (user, args) => ({
      flag: await resolveReportIntegrityFlag(args.id, user.id, args.resolution),
    }),
  }),
]
