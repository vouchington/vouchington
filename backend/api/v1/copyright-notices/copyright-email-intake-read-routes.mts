import { Readable } from 'node:stream'
import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  currentUserCanReviewCopyrightNotices,
  getCopyrightStaffEmailIntake,
  loadCopyrightEmailRawEvidence,
} from '@services/copyright-notices'
import { assertNotSuspended } from '@services/users'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import {
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import { apiOpenApiRawResponse } from '@vouchington/utils/api-response-contract'

app.route('/api/v1/copyright-email-intakes/:id').get(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    'GET:/api/v1/copyright-email-intakes/:id',
  )
  assertNotSuspended(currentUser)
  const intakeId = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'GET:/api/v1/copyright-email-intakes/:id', {
    path: ctx.params,
  })
  const intake = await getCopyrightStaffEmailIntake(intakeId, currentUser)
  ctx.assert(intake, 404, 'Copyright email intake not found')
  ctx.json({ copyright_email_intake: intake })
})

app.route('/api/v1/copyright-email-intakes/:id/raw').get(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    'GET:/api/v1/copyright-email-intakes/:id/raw',
  )
  assertNotSuspended(currentUser)
  const intakeId = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'GET:/api/v1/copyright-email-intakes/:id/raw', { path: ctx.params })
  const evidence = await loadCopyrightEmailRawEvidence(intakeId, currentUser)
  ctx.assert(evidence, 404, 'Copyright email intake not found')
  ctx.set('Content-Type', 'message/rfc822')
  ctx.set('Content-Disposition', 'attachment; filename="original-email.eml"')
  ctx.set('X-Content-Type-Options', 'nosniff')
  ctx.set('Digest', `sha-256=${Buffer.from(evidence.sha256, 'hex').toString('base64')}`)
  await ctx.pipeline(
    Readable.from([
      apiOpenApiRawResponse(
        'GET:/api/v1/copyright-email-intakes/:id/raw',
        'message/rfc822',
        evidence.bytes,
      ),
    ]),
  )
})
