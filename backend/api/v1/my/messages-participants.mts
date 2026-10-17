import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import {
  getMyMessageConversation,
  addMyConversationParticipant,
  removeMyConversationParticipant,
  updateMyConversationPolicy,
} from '@services/messaging/my-message-commands'
import type { ApiUuidContract } from '../../request-contract-types.mts'
type AddParticipantRequest = { user_id: ApiUuidContract }
type UpdateParticipantAddPolicyRequest = { participant_add_policy: 'owner_only' | 'all_members' }

app.route('/api/v1/my/messages/:conversationId').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/messages/:conversationId')
  const result = await getMyMessageConversation(currentUser, ctx.params, input =>
    validateRequestContract(ctx, 'GET:/api/v1/my/messages/:conversationId', input),
  )
  ctx.json(result)
})

app.route('/api/v1/my/messages/:conversationId/participants').post(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'POST:/api/v1/my/messages/:conversationId/participants',
  )
  const result = await addMyConversationParticipant(
    currentUser,
    ctx.params,
    async () => (await ctx.request.json('10kb')) as AddParticipantRequest,
    input =>
      validateRequestContract(ctx, 'POST:/api/v1/my/messages/:conversationId/participants', input),
  )
  ctx.setStatus(201)
  ctx.json(result)
})

app
  .route('/api/v1/my/messages/:conversationId/participants/:userId')
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'DELETE:/api/v1/my/messages/:conversationId/participants/:userId',
    )
    await removeMyConversationParticipant(currentUser, ctx.params, input =>
      validateRequestContract(
        ctx,
        'DELETE:/api/v1/my/messages/:conversationId/participants/:userId',
        input,
      ),
    )
    ctx.setStatus(204)
  })

app.route('/api/v1/my/messages/:conversationId').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/my/messages/:conversationId')
  const result = await updateMyConversationPolicy(
    currentUser,
    ctx.params,
    async () => (await ctx.request.json('10kb')) as UpdateParticipantAddPolicyRequest,
    input => validateRequestContract(ctx, 'PATCH:/api/v1/my/messages/:conversationId', input),
  )
  ctx.json(result)
})
