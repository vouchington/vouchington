import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  createManualSupportReply,
  currentUserCanManageSupport,
  getSupportMessagesByThreadId,
  getSupportThreadById,
} from '@services/customer-support'
import { createPaginationParser } from '@modules/pagination'
import { isUUID } from '@modules/utils'
import { requireAuthAndRateLimit } from '../../../response-helpers.mts'
import { apiQuery, apiRequest } from '../../../response-contract.mts'

import './thread-message-drafts.mts'
import './thread-message-mutations.mts'

const parser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { default: 50, max: 100 },
})

// GET /api/v1/support/threads/:threadId/messages
app.route('/api/v1/support/threads/:threadId/messages').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanManageSupport,
    'GET:/api/v1/support/threads/:threadId/messages',
  )

  const { threadId } = ctx.params
  ctx.assert(isUUID(threadId!), 400, 'Invalid thread ID')

  const thread = await getSupportThreadById(threadId!)
  ctx.assert(thread, 404, 'Thread not found')

  apiQuery('GET:/api/v1/support/threads/:threadId/messages', parser)
  const { limit, after } = parser.parse(ctx.query)
  const { results, page_info } = await getSupportMessagesByThreadId(threadId!, { limit, after })
  ctx.json({ results, page_info })
})

// POST /api/v1/support/threads/:threadId/messages
app.route('/api/v1/support/threads/:threadId/messages').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanManageSupport,
    'POST:/api/v1/support/threads/:threadId/messages',
  )

  const { threadId } = ctx.params
  ctx.assert(isUUID(threadId!), 400, 'Invalid thread ID')

  const thread = await getSupportThreadById(threadId!)
  ctx.assert(thread, 404, 'Thread not found')
  ctx.assert(thread.resolved_at == null, 409, 'Reopen this thread before sending a reply')

  const parsedBody = await ctx.request.json('10kb')
  ctx.assert(
    parsedBody !== null && typeof parsedBody === 'object' && !Array.isArray(parsedBody),
    400,
    'Request body must be an object',
  )
  const rawBody = parsedBody as Record<string, unknown>
  ctx.assert(
    typeof rawBody.body_text === 'string' && rawBody.body_text.trim(),
    400,
    'body_text is required',
  )
  ctx.assert(
    rawBody.body_html === undefined || typeof rawBody.body_html === 'string',
    400,
    'body_html must be a string',
  )
  const body = apiRequest('POST:/api/v1/support/threads/:threadId/messages', {
    body_text: rawBody.body_text,
    ...(typeof rawBody.body_html === 'string' ? { body_html: rawBody.body_html } : {}),
  })

  const result = await createManualSupportReply(threadId!, {
    bodyText: body.body_text as string,
    bodyHtml: typeof body.body_html === 'string' ? body.body_html : undefined,
    createdById: currentUser.id,
  })
  if (result.status !== 'created') {
    ctx.throw(
      result.status === 'not_found' ? 404 : 409,
      result.status === 'not_found'
        ? 'Thread not found'
        : 'Reopen this thread before sending a reply',
    )
    return
  }

  ctx.setStatus(201)
  ctx.json({ message: result.message })
})
