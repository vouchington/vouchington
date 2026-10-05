import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { currentUserCanReviewCopyrightNotices } from '@services/copyright-notices'
import { replayCopyrightEmailIntakeReplyAndEnqueue } from '@services/copyright-notices/copyright-mcp-write-actions'
import { assertNotSuspended } from '@services/users'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import { apiNoRequestBody } from '../../response-contract.mts'
import {
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'

// Replays the failed reply to a declined intake. Like the case replay it answers 200 with
// `replayed: false` when nothing was failed, so a double click or a late retry is harmless.
app.route('/api/v1/copyright-email-intakes/:id/reply/replays').post(async (ctx: Context) => {
  apiNoRequestBody('POST:/api/v1/copyright-email-intakes/:id/reply/replays')
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    'POST:/api/v1/copyright-email-intakes/:id/reply/replays',
  )
  assertNotSuspended(currentUser)
  const intakeId = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'POST:/api/v1/copyright-email-intakes/:id/reply/replays', {
    path: ctx.params,
  })
  ctx.json(await replayCopyrightEmailIntakeReplyAndEnqueue(currentUser, intakeId))
})
