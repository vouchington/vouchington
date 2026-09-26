import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../response-helpers.mts'
import { verifyCaptchaOrAttestation } from '@services/captcha'
import {
  parseCreateModerationAppealInput,
  createModerationAppeal,
  redactModerationAppeal,
} from '@services/moderation-appeals'
import { isModerationStaff } from '@services/users'
import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'

app.route('/api/v1/appeals').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/appeals')
  const provenance = getRequestContentProvenance()
  const body = (await ctx.request.json('1mb')) as Record<string, unknown>
  await verifyCaptchaOrAttestation(ctx, body, { actionTag: 'appeals.create' })
  const input = parseCreateModerationAppealInput(body)
  const { appeal, isDuplicate } = await createModerationAppeal(provenance, currentUser, input)
  const isStaff = isModerationStaff(currentUser)
  ctx.setStatus(isDuplicate ? 200 : 201)
  ctx.json({ appeal: isStaff ? appeal : redactModerationAppeal(appeal), isDuplicate })
})
