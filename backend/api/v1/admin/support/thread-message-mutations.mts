import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  approveSupportMessage,
  currentUserCanManageSupport,
  getSupportMessageById,
  getSupportThreadById,
  sendApprovedSupportMessage,
  updateSupportDraftMessage,
} from '@services/customer-support'
import { isUUID } from '@modules/utils'
import { requireAuthAndRateLimit } from '../../../response-helpers.mts'
import { apiNoRequestBody, apiRequest } from '../../../response-contract.mts'

type SupportMessageUpdateRequest =
  | { body_text: string; body_html?: string }
  | { body_text?: string; body_html: string }

function assertMessageRouteParams(ctx: Context) {
  const { threadId, messageId } = ctx.params
  ctx.assert(isUUID(threadId!), 400, 'Invalid thread ID')
  ctx.assert(isUUID(messageId!), 400, 'Invalid message ID')
  return { threadId: threadId!, messageId: messageId! }
}

async function assertThreadExists(ctx: Context, threadId: string) {
  const thread = await getSupportThreadById(threadId)
  ctx.assert(thread, 404, 'Thread not found')
}

// PATCH /api/v1/support/threads/:threadId/messages/:messageId
app.route('/api/v1/support/threads/:threadId/messages/:messageId').patch(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanManageSupport,
    'PATCH:/api/v1/support/threads/:threadId/messages/:messageId',
  )
  const { threadId, messageId } = assertMessageRouteParams(ctx)
  await assertThreadExists(ctx, threadId)

  const parsedBody = await ctx.request.json('10kb')
  ctx.assert(
    parsedBody !== null && typeof parsedBody === 'object' && !Array.isArray(parsedBody),
    400,
    'Request body must be an object',
  )
  const rawBody = parsedBody as Record<string, unknown>
  ctx.assert(
    rawBody.body_text === undefined || typeof rawBody.body_text === 'string',
    400,
    'body_text must be a string',
  )
  ctx.assert(
    rawBody.body_html === undefined || typeof rawBody.body_html === 'string',
    400,
    'body_html must be a string',
  )
  ctx.assert(
    typeof rawBody.body_text === 'string' || typeof rawBody.body_html === 'string',
    400,
    'body_text or body_html is required',
  )
  // Keep the generated request contract aligned with the runtime guard above: each branch has
  // at least one required editable field, rather than presenting an empty object to clients.
  const requestBody: SupportMessageUpdateRequest =
    typeof rawBody.body_text === 'string'
      ? typeof rawBody.body_html === 'string'
        ? { body_text: rawBody.body_text, body_html: rawBody.body_html }
        : { body_text: rawBody.body_text }
      : { body_html: rawBody.body_html as string }
  const body = apiRequest(
    'PATCH:/api/v1/support/threads/:threadId/messages/:messageId',
    requestBody,
  )
  const updated = await updateSupportDraftMessage(threadId, messageId, {
    bodyText: typeof body.body_text === 'string' ? body.body_text : undefined,
    bodyHtml: typeof body.body_html === 'string' ? body.body_html : undefined,
    editedById: currentUser.id,
  })
  ctx.assert(updated, 404, 'Message not found or not editable')
  ctx.json({ message: updated })
})

// POST /api/v1/support/threads/:threadId/messages/:messageId/approvals
app
  .route('/api/v1/support/threads/:threadId/messages/:messageId/approvals')
  .post(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanManageSupport,
      'POST:/api/v1/support/threads/:threadId/messages/:messageId/approvals',
    )
    const { threadId, messageId } = assertMessageRouteParams(ctx)
    await assertThreadExists(ctx, threadId)
    apiNoRequestBody('POST:/api/v1/support/threads/:threadId/messages/:messageId/approvals')
    const existingMessage = await getSupportMessageById(threadId, messageId)
    ctx.assert(existingMessage, 404, 'Message not found')
    ctx.assert(existingMessage.drafted_at != null, 422, 'Only draft messages can be approved')
    ctx.assert(existingMessage.approved_at == null, 422, 'Message has already been approved')
    ctx.assert(existingMessage.sent_at == null, 422, 'Message has already been sent')

    await approveSupportMessage(threadId, messageId, currentUser.id)
    const updated = await getSupportMessageById(threadId, messageId)
    ctx.setStatus(201)
    ctx.json({ message: updated })
  })

// POST /api/v1/support/threads/:threadId/messages/:messageId/sends
app
  .route('/api/v1/support/threads/:threadId/messages/:messageId/sends')
  .post(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanManageSupport,
      'POST:/api/v1/support/threads/:threadId/messages/:messageId/sends',
    )
    const { threadId, messageId } = assertMessageRouteParams(ctx)
    await assertThreadExists(ctx, threadId)
    apiNoRequestBody('POST:/api/v1/support/threads/:threadId/messages/:messageId/sends')
    await sendApprovedSupportMessage(threadId, messageId, currentUser.id)

    const updated = await getSupportMessageById(threadId, messageId)
    ctx.setStatus(201)
    ctx.json({ message: updated })
  })
