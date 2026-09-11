import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../response-helpers.mts'
import { verifyCaptchaOrAttestation } from '@services/captcha'
import {
  createModerationReport,
  parseCreateModerationReportInput,
} from '@services/moderation-reports'

app.route('/api/v1/reports').post(async (ctx: Context) => {
  ctx.assert(ctx.request.is('json'), 415, 'Invalid Content-Type')
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/reports')
  const body = (await ctx.request.json('1mb')) as Record<string, unknown>
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
