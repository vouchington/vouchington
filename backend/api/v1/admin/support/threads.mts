import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  currentUserCanManageSupport,
  searchSupportThreads,
  getSupportThreadById,
  assignSupportThread,
  resolveSupportThread,
  reopenSupportThread,
} from '@services/customer-support'
import {
  createPaginationParser,
  defineQueryContract,
  queryEnum,
  queryString,
} from '@modules/pagination'
import { isUUID } from '@modules/utils'
import { requireAuthAndRateLimit } from '../../../response-helpers.mts'
import { apiQuery, apiRequest } from '../../../response-contract.mts'

const parser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { default: 25, max: 100 },
})
const statusValues = ['open', 'assigned', 'resolved'] as const
const filters = defineQueryContract({
  q: queryString(),
  status: queryEnum(statusValues),
})

type SupportThreadPatchBody = { assigned_to_id: string } | { resolved: boolean }

// GET /api/v1/support/threads
app.route('/api/v1/support/threads').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(ctx, currentUserCanManageSupport, 'GET:/api/v1/support/threads')

  apiQuery('GET:/api/v1/support/threads', parser, filters)
  const { limit, after } = parser.parse(ctx.query)
  type StatusValue = (typeof statusValues)[number]
  ctx.assert(
    ctx.query.status === undefined || statusValues.includes(ctx.query.status as StatusValue),
    400,
    'status must be one of: open, assigned, resolved',
  )
  const status = ctx.query.status as StatusValue | undefined
  const q = typeof ctx.query.q === 'string' ? ctx.query.q : undefined

  const { results, page_info } = await searchSupportThreads({ status, q, limit, after })
  ctx.json({ results, page_info })
})

// GET /api/v1/support/threads/:threadId
app.route('/api/v1/support/threads/:threadId').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanManageSupport,
    'GET:/api/v1/support/threads/:threadId',
  )

  const { threadId } = ctx.params
  ctx.assert(isUUID(threadId!), 400, 'Invalid thread ID')

  const thread = await getSupportThreadById(threadId!)
  ctx.assert(thread, 404, 'Thread not found')

  ctx.json({ thread })
})

// PATCH /api/v1/support/threads/:threadId
app.route('/api/v1/support/threads/:threadId').patch(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanManageSupport,
    'PATCH:/api/v1/support/threads/:threadId',
  )

  const { threadId } = ctx.params
  ctx.assert(isUUID(threadId!), 400, 'Invalid thread ID')

  const thread = await getSupportThreadById(threadId!)
  ctx.assert(thread, 404, 'Thread not found')

  const parsedBody = await ctx.request.json('10kb')
  ctx.assert(
    parsedBody !== null && typeof parsedBody === 'object' && !Array.isArray(parsedBody),
    400,
    'Request body must be an object',
  )
  const rawBody = parsedBody as Record<string, unknown>
  const patchKeys = Object.keys(rawBody)
  ctx.assert(
    patchKeys.length === 1 && ['assigned_to_id', 'resolved'].includes(patchKeys[0]!),
    400,
    'Exactly one of assigned_to_id or resolved is required',
  )
  let validatedBody: SupportThreadPatchBody

  if (rawBody.assigned_to_id !== undefined) {
    ctx.assert(
      typeof rawBody.assigned_to_id === 'string' && isUUID(rawBody.assigned_to_id),
      400,
      'assigned_to_id must be a valid UUID',
    )
    validatedBody = { assigned_to_id: rawBody.assigned_to_id }
  } else if (rawBody.resolved === true || rawBody.resolved === false) {
    validatedBody = { resolved: rawBody.resolved }
  } else {
    ctx.throw(400, 'No valid update fields provided')
  }

  const body = apiRequest('PATCH:/api/v1/support/threads/:threadId', validatedBody)
  if ('assigned_to_id' in body) {
    ctx.assert(
      body.assigned_to_id === currentUser.id,
      422,
      'Support threads can only be assigned to the authenticated administrator',
    )
    await assignSupportThread(threadId!, body.assigned_to_id, currentUser.id)
  } else if (body.resolved) {
    await resolveSupportThread(threadId!, currentUser.id)
  } else {
    await reopenSupportThread(threadId!, currentUser.id)
  }

  const updated = await getSupportThreadById(threadId!)
  ctx.json({ thread: updated })
})
