import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { DEFAULT_AGENT_MODEL } from '@agents/_shared'
import {
  currentUserCanManageSupport,
  getSupportThreadById,
  requestSupportDraftGeneration,
} from '@services/customer-support'
import { isUUID } from '@modules/utils'
import { SUPPORT_THREAD_INBOUND_MESSAGE_REQUIRED } from '@modules/on-error/error-codes'
import { requireAuthAndRateLimit } from '../../../response-helpers.mts'
import { apiNoRequestBody } from '../../../response-contract.mts'

// POST /api/v1/support/threads/:threadId/drafts
app.route('/api/v1/support/threads/:threadId/drafts').post(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanManageSupport,
    'POST:/api/v1/support/threads/:threadId/drafts',
  )

  const { threadId } = ctx.params
  ctx.assert(isUUID(threadId!), 400, 'Invalid thread ID')

  const thread = await getSupportThreadById(threadId!)
  ctx.assert(thread, 404, 'Thread not found')
  ctx.assert(thread.resolved_at == null, 409, 'Reopen this thread before generating a draft')
  apiNoRequestBody('POST:/api/v1/support/threads/:threadId/drafts')
  const reservation = await requestSupportDraftGeneration(threadId!, {
    modelName: DEFAULT_AGENT_MODEL,
    modelProvider: 'openai',
  })
  if (reservation.status === 'no_inbound_message') {
    ctx.throw(
      422,
      'An inbound message is required before generating a draft',
      SUPPORT_THREAD_INBOUND_MESSAGE_REQUIRED,
    )
  }
  ctx.assert(reservation.status === 'reserved', 409, 'A draft is already pending')

  ctx.setStatus(202)
  ctx.json({ queued: true })
})
