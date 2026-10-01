import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  getConversationForThread,
  currentUserCanViewConversation,
  currentUserCanManageParticipants,
  currentUserCanChangeParticipantPolicy,
  addConversationParticipant,
  removeConversationParticipant,
  updateConversationParticipantAddPolicy,
} from '@services/messaging'
import { assertNotSuspended } from '@services/users'
import { isUUID } from '@modules/utils'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import type { ApiUuidContract } from '../../request-contract-types.mts'

type AddParticipantRequest = { user_id: ApiUuidContract }

type UpdateParticipantAddPolicyRequest = {
  participant_add_policy: 'owner_only' | 'all_members'
}

// GET /api/v1/my/messages/:conversationId
app.route('/api/v1/my/messages/:conversationId').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/messages/:conversationId')

  const conversationId = ctx.params.conversationId!
  ctx.assert(isUUID(conversationId), 422, 'Invalid conversation ID')
  validateRequestContract(ctx, 'GET:/api/v1/my/messages/:conversationId', { path: ctx.params })

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
  // The service repeats this check; running it first keeps the schema diagnostic behind the role gate.
  const canManage = await currentUserCanManageParticipants(currentUser.id, conversationId)
  ctx.assert(canManage, 403, 'Access denied')

  const body = (await ctx.request.json('10kb')) as AddParticipantRequest
  validateRequestContract(ctx, 'POST:/api/v1/my/messages/:conversationId/participants', {
    path: ctx.params,
    body,
  })

  const newUserId = body.user_id.toLowerCase()
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
    validateRequestContract(
      ctx,
      'DELETE:/api/v1/my/messages/:conversationId/participants/:userId',
      { path: ctx.params },
    )

    await removeConversationParticipant(currentUser.id, conversationId, targetUserId.toLowerCase())

    ctx.setStatus(204)
  })

// PATCH /api/v1/my/messages/:conversationId
app.route('/api/v1/my/messages/:conversationId').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/my/messages/:conversationId')
  assertNotSuspended(currentUser)

  const conversationId = ctx.params.conversationId!
  ctx.assert(isUUID(conversationId), 422, 'Invalid conversation ID')
  // The service repeats this check; running it first keeps the schema diagnostic behind the role gate.
  const canChange = await currentUserCanChangeParticipantPolicy(currentUser.id, conversationId)
  ctx.assert(canChange, 403, 'Only the owner can change participant policy')

  const body = (await ctx.request.json('10kb')) as UpdateParticipantAddPolicyRequest
  validateRequestContract(ctx, 'PATCH:/api/v1/my/messages/:conversationId', {
    path: ctx.params,
    body,
  })

  await updateConversationParticipantAddPolicy(
    currentUser.id,
    conversationId,
    body.participant_add_policy,
  )

  ctx.json({ participant_add_policy: body.participant_add_policy })
})
