import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, requireAuthAndRateLimit } from '../../response-helpers.mts'
import {
  currentUserCanCreateSupportThread,
  currentUserCanViewSupportThread,
  getOrCreateSupportContactByEmail,
  linkSupportContactToUser,
  getSupportContactByEmail,
  getSupportThreadById,
  getSupportThreadsByContactId,
  getSupportMessagesByThreadId,
  createSupportThreadWithInitialMessage,
} from '@services/customer-support'
import { getConversationById } from '@services/conversations-messages'
import { createPaginationParser } from '@modules/pagination'
import { isUUID } from '@modules/utils'
import { DEFAULT_AGENT_MODEL } from '@agents/_shared'

const parser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { default: 25, max: 100 },
})

// POST /api/v1/my/support-threads
app.route('/api/v1/my/support-threads').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanCreateSupportThread,
    'POST:/api/v1/my/support-threads',
  )

  const body = (await ctx.request.json('10kb')) as Record<string, unknown>
  ctx.assert(typeof body.subject === 'string' && body.subject.trim(), 400, 'subject is required')
  if (body.message !== undefined) {
    ctx.assert(typeof body.message === 'string', 400, 'Invalid message')
  }

  const emailAddress = currentUser.email_address
  ctx.assert(emailAddress, 422, 'User must have an email address to submit support requests')

  const contact = await getOrCreateSupportContactByEmail(emailAddress, currentUser.username)

  // Link contact to user if not already linked
  if (contact.user_id !== currentUser.id) {
    await linkSupportContactToUser(contact.id, currentUser.id)
  }

  const { conversation_id: conversationIdParam } = body
  let conversationId: string | undefined
  if (conversationIdParam !== undefined) {
    ctx.assert(
      typeof conversationIdParam === 'string' && isUUID(conversationIdParam),
      400,
      'Invalid conversation ID',
    )
    const conversation = await getConversationById(conversationIdParam)
    ctx.assert(conversation?.created_by_id === currentUser.id, 404, 'Conversation not found')
    conversationId = conversationIdParam
  }

  const { thread, message } = await createSupportThreadWithInitialMessage(
    contact.id,
    body.subject as string,
    {
      conversationId,
      message: typeof body.message === 'string' ? body.message : undefined,
      agentModelName: DEFAULT_AGENT_MODEL,
      agentModelProvider: 'openai',
    },
  )

  ctx.setStatus(201)
  ctx.json({ thread, message: message ?? null })
})

// GET /api/v1/my/support-threads
app.route('/api/v1/my/support-threads').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/support-threads')

  const emailAddress = currentUser.email_address
  if (!emailAddress) {
    ctx.json({ results: [], page_info: { has_next_page: false, end_cursor: null } })
    return
  }

  const contact = await getSupportContactByEmail(emailAddress)
  if (!contact) {
    ctx.json({ results: [], page_info: { has_next_page: false, end_cursor: null } })
    return
  }

  const { limit, after } = parser.parse(ctx.query)
  const { results, page_info } = await getSupportThreadsByContactId(contact.id, { limit, after })
  ctx.json({ results, page_info })
})

// GET /api/v1/my/support-threads/:threadId
app.route('/api/v1/my/support-threads/:threadId').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/support-threads/:threadId')

  const { threadId } = ctx.params
  ctx.assert(isUUID(threadId!), 400, 'Invalid thread ID')

  const thread = await getSupportThreadById(threadId!)
  ctx.assert(thread, 404, 'Thread not found')

  ctx.assert(
    currentUserCanViewSupportThread(currentUser, thread, thread.contact_user_id),
    403,
    'Forbidden',
  )

  const { limit, after } = parser.parse(ctx.query)
  const page = after ? undefined : 'latest'
  const { results: messages, page_info } = await getSupportMessagesByThreadId(threadId!, {
    limit,
    after,
    page,
  })
  ctx.json({ thread, messages, page_info })
})
