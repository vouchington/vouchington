import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  getConversationForThread,
  currentUserCanViewConversation,
  addConversationParticipant,
  removeConversationParticipant,
  updateConversationParticipantAddPolicy,
} from '@services/messaging'
import { assertNotSuspended } from '@services/users'
import { isUUID } from '@modules/utils'
import { requireAuth } from '../../response-helpers.mts'

// GET /api/v1/my/messages/:conversationId
app.route('/api/v1/my/messages/:conversationId').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/messages/:conversationId')

  const conversationId = ctx.params.conversationId!
  ctx.assert(isUUID(conversationId), 422, 'Invalid conversation ID')

  const conversation = await getConversationForThread(currentUser.id, conversationId)
  ctx.assert(conversation, 403, 'Access denied')

  ctx.json({ conversation })
})

// POST /api/v1/my/messages/:conversationId/participants
app.route('/api/v1/my/messages/:conversationId/participants').post(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'POST:/api/v1/my/messages/:conversationId/participants',
  )
  assertNotSuspended(currentUser)

  const conversationId = ctx.params.conversationId!
  ctx.assert(isUUID(conversationId), 422, 'Invalid conversation ID')

  const body = (await ctx.request.json('10kb')) as Record<string, unknown>
  ctx.assert(
    body !== null && typeof body === 'object' && !Array.isArray(body),
    400,
    'Invalid request body',
  )
  ctx.assert(
    typeof body.user_id === 'string' && isUUID(body.user_id as string),
    422,
    'user_id must be a UUID',
  )

  const newUserId = (body.user_id as string).toLowerCase()
  ctx.assert(
    newUserId !== currentUser.id,
    400,
    'Cannot add yourself — you are already a participant',
  )

  const participant = await addConversationParticipant(currentUser.id, conversationId, newUserId)

  ctx.setStatus(201)
  ctx.json({ participant })
})

// DELETE /api/v1/my/messages/:conversationId/participants/:userId
app
  .route('/api/v1/my/messages/:conversationId/participants/:userId')
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'DELETE:/api/v1/my/messages/:conversationId/participants/:userId',
    )
    assertNotSuspended(currentUser)

    const conversationId = ctx.params.conversationId!
    const targetUserId = ctx.params.userId!
    ctx.assert(isUUID(conversationId), 422, 'Invalid conversation ID')
    ctx.assert(isUUID(targetUserId), 422, 'Invalid user ID')

    const canView = await currentUserCanViewConversation(currentUser.id, conversationId)
    ctx.assert(canView, 403, 'Access denied')

    await removeConversationParticipant(currentUser.id, conversationId, targetUserId.toLowerCase())

    ctx.setStatus(204)
  })

// PATCH /api/v1/my/messages/:conversationId
app.route('/api/v1/my/messages/:conversationId').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/my/messages/:conversationId')
  assertNotSuspended(currentUser)

  const conversationId = ctx.params.conversationId!
  ctx.assert(isUUID(conversationId), 422, 'Invalid conversation ID')

  const body = (await ctx.request.json('10kb')) as Record<string, unknown>
  ctx.assert(
    body !== null && typeof body === 'object' && !Array.isArray(body),
    400,
    'Invalid request body',
  )
  ctx.assert(
    body.participant_add_policy === 'owner_only' || body.participant_add_policy === 'all_members',
    422,
    'participant_add_policy must be "owner_only" or "all_members"',
  )

  await updateConversationParticipantAddPolicy(
    currentUser.id,
    conversationId,
    body.participant_add_policy as 'owner_only' | 'all_members',
  )

  ctx.json({ participant_add_policy: body.participant_add_policy })
})
