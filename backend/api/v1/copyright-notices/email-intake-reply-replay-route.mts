import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { enqueueSendCopyrightNoticeEmail } from '@queues/emails/enqueues'
import {
  currentUserCanReviewCopyrightNotices,
  replayFailedCopyrightEmailIntakeReply,
} from '@services/copyright-notices'
import { assertNotSuspended } from '@services/users'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import { requireAuthAndRateLimit, validateUUIDParam } from '../../response-helpers.mts'

// Replays the failed reply to a declined intake. Like the case replay it answers 200 with
// `replayed: false` when nothing was failed, so a double click or a late retry is harmless.
app.route('/api/v1/copyright-email-intakes/:id/reply/replays').post(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    'POST:/api/v1/copyright-email-intakes/:id/reply/replays',
  )
  assertNotSuspended(currentUser)
  const intentId = await replayFailedCopyrightEmailIntakeReply({
    currentUser,
    intakeId: validateUUIDParam(ctx, 'id'),
  })
  if (intentId) void enqueueSendCopyrightNoticeEmail(intentId)
  ctx.json({ replayed: intentId !== null })
})
