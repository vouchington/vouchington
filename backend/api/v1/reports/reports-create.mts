import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import type { ApiUuidContract } from '../../request-contract-types.mts'
import { verifyCaptchaOrAttestation } from '@services/captcha'
import {
  createModerationReport,
  parseCreateModerationReportInput,
  type ModerationReportEntityType,
  type ModerationReportReason,
} from '@services/moderation-reports'

type CreateModerationReportRequest = {
  entityType: ModerationReportEntityType
  entityId: ApiUuidContract
  reason: ModerationReportReason
  note?: string | null
  cf_turnstile_response?: string
}

app.route('/api/v1/reports').post(async (ctx: Context) => {
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/reports')
  const body = (await ctx.request.json('1mb')) as CreateModerationReportRequest
  validateRequestContract(ctx, 'POST:/api/v1/reports', { body })
  await verifyCaptchaOrAttestation(ctx, body, { actionTag: 'reports.create' })
  const input = parseCreateModerationReportInput({
    entityType: body.entityType,
    entityId: body.entityId,
    reason: body.reason,
    note: body.note,
  })
  const { report, isDuplicate } = await createModerationReport(currentUser.id, input)
  const { case_id: _caseId, ...reportResponse } = report
  ctx.setStatus(isDuplicate ? 200 : 201)
  ctx.json({ report: reportResponse, isDuplicate })
})
